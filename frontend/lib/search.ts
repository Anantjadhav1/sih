/**
 * Lightweight relevance scoring - swap for embeddings-based search
 * (e.g. sentence-transformers + pgvector) in production.
 *
 * This is a TF-IDF-flavoured keyword scorer with a typo-tolerant matcher, run
 * entirely in the browser over a fixed catalogue of a few dozen rows. It has no
 * semantic understanding: "farmland" will not match "agricultural" here, where
 * an embedding model would. The production path is to embed each document's
 * abstract once, store the vectors in pgvector alongside ResearchDocuments, and
 * rank by cosine similarity - the scoring call site below stays the same shape.
 *
 * What it does give us, cheaply and offline:
 *   - matching across title, description, organisation, authors, type and tags
 *     rather than one field
 *   - IDF weighting, so a rare term like "svamitva" outranks a common one
 *   - prefix and edit-distance matching, so "vulnerabilty" still finds
 *     "vulnerability"
 *   - a normalised 0-1 score the UI can show as a relevance percentage
 */

import { REPOSITORY } from "@/lib/repository";
import type { RepositoryEntry } from "@/lib/repository";

/** Field weights: a title hit means more than a description hit. */
const FIELD_WEIGHTS = {
  title: 3.0,
  type: 2.0,
  tags: 2.0,
  org: 1.4,
  authors: 1.2,
  description: 1.0,
} as const;

type Field = keyof typeof FIELD_WEIGHTS;

/**
 * Filler words carry no meaning for matching. Left in, "what is the risk in
 * this area" would match every document through "the", "is" and "in".
 */
const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how " +
    "if in into is it its me my no not of on or our so than that the their them then " +
    "there these they this those to too was we were what when where which who why will " +
    "with would you your about any all also more most much only such very here happen"
  ).split(" ")
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function fieldsOf(entry: RepositoryEntry): Record<Field, string[]> {
  return {
    title: tokenize(entry.title),
    type: tokenize(entry.type),
    tags: entry.tags.flatMap(tokenize),
    org: tokenize(entry.org),
    authors: tokenize(entry.authors),
    description: tokenize(entry.description),
  };
}

/** Precomputed once per module load - the catalogue is static. */
const INDEX = REPOSITORY.map((entry) => ({ entry, fields: fieldsOf(entry) }));

/**
 * Inverse document frequency per term. Terms appearing in most documents carry
 * almost no signal; terms in one or two documents carry a lot.
 */
const IDF: Map<string, number> = (() => {
  const df = new Map<string, number>();
  for (const { fields } of INDEX) {
    const seen = new Set(Object.values(fields).flat());
    for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = INDEX.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log(1 + n / count));
  return idf;
})();

/** Bounded Levenshtein: returns the distance, or `max + 1` once it exceeds max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(v);
      if (v < rowBest) rowBest = v;
    }
    // Whole row already worse than the budget - no path back under it
    if (rowBest > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** Typo budget scales with word length: short words get no slack. */
function typoBudget(term: string): number {
  if (term.length <= 3) return 0;
  if (term.length <= 6) return 1;
  return 2;
}

/**
 * How well one query term matches one document term: 1 exact, 0.85 prefix,
 * down to ~0.5 for a distant-but-within-budget typo, 0 for no match.
 */
function termSimilarity(query: string, docTerm: string): number {
  if (query === docTerm) return 1;
  if (docTerm.startsWith(query)) {
    // Partial word: "vuln" -> "vulnerability". Longer prefixes score higher.
    return 0.7 + 0.15 * (query.length / docTerm.length);
  }
  // One word inside the other ("plain" in "floodplain"). The contained part
  // must be at least 5 letters: otherwise short generic words leak in, and
  // "farmland" would match every title containing "land".
  const shorter = query.length < docTerm.length ? query : docTerm;
  if (shorter.length >= 5 && (query.includes(docTerm) || docTerm.includes(query))) return 0.6;

  const budget = typoBudget(query);
  if (budget === 0) return 0;
  const d = editDistance(query, docTerm, budget);
  if (d > budget) return 0;
  return 0.75 - 0.2 * (d - 1);
}

export interface ScoredEntry {
  entry: RepositoryEntry;
  /** 0-1 relevance, normalised against the best hit in this result set. */
  relevance: number;
  /**
   * Un-normalised score. Relevance always gives the best hit 100%, even a
   * weak one; this is what says whether a match is strong in absolute terms.
   */
  score: number;
}

/**
 * Rank the catalogue against a free-text query.
 *
 * Returns every entry that matched at all, ordered best-first. An empty query
 * returns the whole catalogue newest-first with no relevance attached.
 */
export function searchRepository(rawQuery: string): ScoredEntry[] {
  const queryTerms = tokenize(rawQuery);
  if (queryTerms.length === 0) {
    return [...REPOSITORY]
      .sort((a, b) => b.published.localeCompare(a.published))
      .map((entry) => ({ entry, relevance: 0, score: 0 }));
  }

  const scored = INDEX.map(({ entry, fields }) => {
    let total = 0;

    for (const q of queryTerms) {
      // Best single match for this query term, per field, weighted by field
      let termScore = 0;
      for (const [field, terms] of Object.entries(fields) as [Field, string[]][]) {
        let best = 0;
        for (const docTerm of terms) {
          const sim = termSimilarity(q, docTerm);
          if (sim > best) best = sim;
          if (best === 1) break;
        }
        if (best > 0) {
          // IDF of the query term itself where known, else treat as rare
          const idf = IDF.get(q) ?? Math.log(1 + INDEX.length);
          termScore = Math.max(termScore, best * FIELD_WEIGHTS[field] * idf);
        }
      }
      total += termScore;
    }

    // Reward covering more of the query rather than one term matching loudly
    const covered = queryTerms.filter((q) =>
      Object.values(fields)
        .flat()
        .some((t) => termSimilarity(q, t) > 0)
    ).length;
    const coverage = covered / queryTerms.length;

    return { entry, raw: total * (0.4 + 0.6 * coverage) };
  }).filter((r) => r.raw > 0);

  if (scored.length === 0) return [];

  // Normalise against the top hit so the badge reads as "relative to the best
  // match here", which is what a percentage means to a reader.
  const top = Math.max(...scored.map((s) => s.raw));
  return scored
    .map((s) => ({ entry: s.entry, relevance: s.raw / top, score: s.raw }))
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * Minimum absolute score for the Co-pilot to cite a document. Calibrated so
 * that one exact title or tag match on a distinctive word qualifies, while a
 * stray partial match in a description does not - better to cite nothing than
 * to cite something off-topic.
 */
export const CITE_MIN_SCORE = 3;

/**
 * Step 1 of the Co-pilot's retrieval-augmented answers: the library passages
 * worth sending along with a question. Same scoring as the search box.
 */
export function retrieveSources(question: string, limit = 2): RepositoryEntry[] {
  return searchRepository(question)
    .filter((r) => r.score >= CITE_MIN_SCORE)
    .slice(0, limit)
    .map((r) => r.entry);
}
