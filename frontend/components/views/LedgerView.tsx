"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Blocks,
  CircleCheck,
  CircleX,
  FileText,
  Fingerprint,
  Link as LinkIcon,
  Pickaxe,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RISK_COLORS, riskColor } from "@/lib/districts";
import {
  checkReportHash,
  fetchLedger,
  restoreLedger,
  shortHash,
  tamperBlock,
} from "@/lib/ledger";
import type { Block, BlockCheck, LedgerState, ReportCheck } from "@/lib/ledger";
import { useRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

// Chain health is a status, so it reuses the status ramp - always with an
// icon and a written label, never colour alone.
const OK = RISK_COLORS.Low;
const BAD = RISK_COLORS.High;

const nf = new Intl.NumberFormat("en-IN");

const CONCEPTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Blocks,
    title: "Block",
    text: "One sealed record: the decision, the numbers behind it, and the time.",
  },
  {
    icon: Fingerprint,
    title: "Hash",
    text: "A fingerprint of the block's contents. Change one letter and it changes completely.",
  },
  {
    icon: LinkIcon,
    title: "Chain",
    text: "Each block stores the previous block's hash, so editing an old block breaks the link after it.",
  },
  {
    icon: Pickaxe,
    title: "Proof of work",
    text: "A block is only accepted once the computer finds a number that makes its hash start with 000.",
  },
];

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The arrow between two blocks: does the lower one point at the upper one? */
function LinkConnector({ prev, block, check }: { prev: Block; block: Block; check: BlockCheck }) {
  const ok = check.link_ok;
  return (
    <div className="flex items-center gap-3 py-1.5 pl-6">
      <div className="h-8 w-px" style={{ backgroundColor: ok ? "hsl(var(--border))" : BAD }} />
      <p className="text-[11px] text-muted-foreground">
        {ok ? (
          <>
            <span className="font-medium" style={{ color: OK }}>
              ✓ Linked
            </span>{" "}
            &mdash; Block #{block.index} stores Block #{prev.index}&rsquo;s hash{" "}
            <span className="font-mono text-foreground">{shortHash(block.previous_hash)}</span>
          </>
        ) : (
          <>
            <span className="font-medium" style={{ color: BAD }}>
              ✗ Link broken
            </span>{" "}
            &mdash; Block #{block.index} points to{" "}
            <span className="font-mono text-foreground">{shortHash(block.previous_hash)}</span>, but
            Block #{prev.index}&rsquo;s hash is now{" "}
            <span className="font-mono text-foreground">{shortHash(prev.hash)}</span>
          </>
        )}
      </p>
    </div>
  );
}

function BlockCard({ block, check }: { block: Block; check: BlockCheck }) {
  const d = block.data;
  const broken = check.problem !== null;
  const isGenesis = d.type === "genesis";

  return (
    <article
      className="rounded-lg border bg-surface-2/50 p-4"
      style={{ borderColor: broken ? BAD : "hsl(var(--border))" }}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
          Block #{block.index}
        </span>
        {isGenesis && (
          <span className="text-[11px] text-muted-foreground">Genesis &mdash; the first block</span>
        )}
        {d.decision && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              d.decision === "approved"
                ? "border-primary/40 text-primary"
                : "border-border text-muted-foreground"
            )}
          >
            {d.decision}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">{when(block.timestamp)}</span>
        {!isGenesis && (
          <a
            href={`/report?block=${block.index}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <FileText className="h-3 w-3" />
            Report
          </a>
        )}
        <span
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: broken ? BAD : OK }}
        >
          {broken ? <CircleX className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
          {broken ? "Failed check" : "Verified"}
        </span>
      </header>

      {!isGenesis && <h3 className="mt-2 text-sm font-medium leading-snug">{d.title}</h3>}

      {d.risk_score !== undefined && (
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Risk</dt>
            <dd className="flex items-center gap-1 font-medium">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: riskColor(d.risk_level) }}
              />
              <span className="font-mono">{d.risk_score}</span> {d.risk_level}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Flood</dt>
            <dd className="font-mono">+{d.flood_risk_increase_pct}%</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Displaced</dt>
            <dd className="font-mono">{nf.format(d.displacement_persons ?? 0)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">By</dt>
            <dd>{d.recorded_by}</dd>
          </div>
        </dl>
      )}

      {/* The technical seal, kept small - it is evidence, not the headline */}
      <div className="mt-3 grid gap-1 rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-[10px] text-muted-foreground sm:grid-cols-3">
        <span>
          prev hash <span className="text-foreground">{shortHash(block.previous_hash)}</span>
        </span>
        <span>
          hash <span className="text-foreground">{shortHash(block.hash)}</span>
        </span>
        <span title="Proof of work: how many numbers were tried before the hash started with 000">
          found after <span className="text-foreground">{nf.format(block.nonce + 1)}</span> tries
        </span>
      </div>

      {broken && (
        <div
          className="mt-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: `${BAD}66`, backgroundColor: `${BAD}14` }}
        >
          <p className="font-medium" style={{ color: BAD }}>
            {check.problem}
          </p>
          {!check.fingerprint_ok && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              sealed as {shortHash(block.hash)} &middot; contents now hash to{" "}
              {shortHash(check.recomputed_hash)}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/** The verdict on a pasted report fingerprint, in plain language. */
function ReportVerdict({ result }: { result: ReportCheck }) {
  if (result.kind === "invalid-input") {
    return (
      <p className="text-[11px] text-muted-foreground">
        That doesn&rsquo;t look like a fingerprint - paste the long code printed under
        &ldquo;Fingerprint (hash)&rdquo; on the report.
      </p>
    );
  }
  const good = result.kind === "genuine";
  return (
    <div
      className="rounded-md border px-3 py-2 text-[11px] leading-relaxed"
      style={{ borderColor: good ? `${OK}66` : `${BAD}66`, backgroundColor: good ? `${OK}12` : `${BAD}14` }}
    >
      <p className="font-semibold" style={{ color: good ? OK : BAD }}>
        {result.kind === "genuine" && `✓ Genuine - matches Block #${result.block.index}, which is intact`}
        {result.kind === "altered" && `✗ Matches Block #${result.block.index}, but that record has been edited`}
        {result.kind === "unknown" && "✗ No block on the ledger has this fingerprint"}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {result.kind === "genuine" &&
          `Every number on that report is exactly what was sealed: ${result.block.data.title}.`}
        {result.kind === "altered" && `${result.problem} Restore the honest copy and check again.`}
        {result.kind === "unknown" &&
          (result.chainBrokenAt !== null
            ? `The ledger itself fails verification at Block #${result.chainBrokenAt}, so someone may have re-sealed a record. Restore the honest copy and check again.`
            : "This report does not match any sealed decision - treat it as forged.")}
      </p>
    </div>
  );
}

export default function LedgerView() {
  const { role } = useRole();
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  const [reportInput, setReportInput] = useState("");
  // The verdict is recomputed whenever the ledger changes, so tampering with
  // or restoring the chain updates an already-checked report straight away.
  const [checkedHash, setCheckedHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<number>(1);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<LedgerState>, message?: string) => {
    setBusy(true);
    setError(null);
    try {
      setLedger(await fn());
      setLastAction(message ?? null);
    } catch (e) {
      setError((e as Error).message || "Could not reach the ledger. Is FastAPI running on :8000?");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    run(fetchLedger);
  }, [run]);

  const v = ledger?.verification;
  const blocks = ledger?.blocks ?? [];
  const tamperable = blocks.filter((b) => b.index > 0);
  // A re-sealed LAST block has no later block whose link could break, so the
  // chain alone cannot catch it - in a real network the other copies would.
  // Offer re-sealing only where the chain itself can show the break.
  const targetIsLast = target === blocks[blocks.length - 1]?.index;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Blockchain Ledger</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Every policy an official approves or rejects is sealed here together with the
            risk numbers it was decided on. Anyone can check that no old record has been
            changed. You are viewing as{" "}
            <span className="font-medium text-foreground">{role?.label}</span>
            {role?.canRecord
              ? " - you can add decisions from the Simulator."
              : " - only government officials can add decisions."}
          </p>
        </header>

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            {error}
          </p>
        )}

        {/* ---- Status: the one thing to read first ---- */}
        {v && (
          <section
            className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
            style={{
              borderColor: v.valid ? `${OK}66` : `${BAD}88`,
              backgroundColor: v.valid ? `${OK}12` : `${BAD}14`,
            }}
          >
            {v.valid ? (
              <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: OK }} />
            ) : (
              <ShieldAlert className="h-5 w-5 shrink-0" style={{ color: BAD }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {v.valid
                  ? `Chain verified - all ${v.checked_blocks} blocks are intact`
                  : `Tampering detected at Block #${v.first_broken_index}`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {v.valid
                  ? "Every hash was recomputed and every link checked just now."
                  : v.blocks.find((b) => b.index === v.first_broken_index)?.problem}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-[11px]"
              disabled={busy}
              onClick={() => run(fetchLedger, "Re-verified every block.")}
            >
              Verify again
            </Button>
            {!v.valid && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-[11px]"
                disabled={busy}
                onClick={() =>
                  run(restoreLedger, "Restored the honest copy, as the rest of the network would.")
                }
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore honest copy
              </Button>
            )}
          </section>
        )}
        {lastAction && (
          <p className="mt-2 text-[11px] text-muted-foreground">{lastAction}</p>
        )}

        {/* ---- The four ideas, in plain language ---- */}
        <section className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CONCEPTS.map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <c.icon className="h-3.5 w-3.5 text-primary" />
                {c.title}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </section>

        {/* ---- The chain itself, oldest first ---- */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold">
            The chain{" "}
            <span className="font-normal text-muted-foreground">
              &middot; {blocks.length} blocks, oldest first
            </span>
          </h2>
          <div className="mt-3">
            {blocks.map((b, i) => {
              const check = v?.blocks.find((c) => c.index === b.index);
              if (!check) return null;
              return (
                <div key={b.index}>
                  {i > 0 && <LinkConnector prev={blocks[i - 1]} block={b} check={check} />}
                  <BlockCard block={b} check={check} />
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- Is a printed report genuine? ---- */}
        {ledger && (
          <section className="mt-6 rounded-lg border border-border bg-surface-2/40 p-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Check a report
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Every decision has a printable report (use the Report link on a block). Paste the
              fingerprint printed on a report to prove it hasn&rsquo;t been forged.
            </p>
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setCheckedHash(reportInput);
              }}
            >
              <input
                value={reportInput}
                onChange={(e) => setReportInput(e.target.value)}
                placeholder="Paste a fingerprint, e.g. 000a84f2…"
                aria-label="Report fingerprint"
                spellCheck={false}
                className="h-8 min-w-[16rem] flex-1 rounded-md border border-border bg-surface-2 px-2.5 font-mono text-[11px] outline-none focus:border-primary/50"
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="h-8 text-[11px]"
                disabled={!reportInput.trim()}
              >
                Check
              </Button>
            </form>
            {checkedHash && (
              <div className="mt-3">
                <ReportVerdict result={checkReportHash(ledger, checkedHash)} />
              </div>
            )}
          </section>
        )}

        {/* ---- Live demonstration of tamper detection ---- */}
        {tamperable.length > 0 && (
          <section className="mt-6 rounded-lg border border-dashed border-border bg-surface-2/30 p-4">
            <h2 className="text-xs font-semibold">Try to cheat the ledger</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Pretend you are a corrupt insider with direct database access, trying to make a
              risky decision look safe. Pick a block and change its risk score.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                aria-label="Block to tamper with"
                className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[11px]"
              >
                {tamperable.map((b) => (
                  <option key={b.index} value={b.index}>
                    Block #{b.index}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-[11px]"
                disabled={busy}
                onClick={() =>
                  run(
                    () => tamperBlock(target, false),
                    `Changed Block #${target}'s risk score without updating its hash.`
                  )
                }
              >
                Edit the record
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-[11px]"
                disabled={busy || targetIsLast}
                title={
                  targetIsLast
                    ? "The newest block has nothing after it to break - pick an earlier block"
                    : undefined
                }
                onClick={() =>
                  run(
                    () => tamperBlock(target, true),
                    `Changed Block #${target} and re-mined its hash so it looks valid on its own.`
                  )
                }
              >
                Edit and re-seal the hash
              </Button>
            </div>
            <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Edit the record</span> - caught at
                that block: its contents no longer match its fingerprint.
              </li>
              <li>
                <span className="font-medium text-foreground">Edit and re-seal</span> - the block
                looks fine, but the next block still points to the old hash, so the chain
                breaks there. Hiding it means re-mining every later block.
              </li>
            </ul>
            {targetIsLast && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Re-sealing is off for the newest block: nothing comes after it yet, so only
                other copies of the ledger could catch it. Pick an earlier block.
              </p>
            )}
          </section>
        )}

        <p className="mt-6 text-[10px] leading-relaxed text-muted-foreground">
          This demo keeps one copy of the ledger plus an honest backup. A production network
          gives copies to many independent offices, which must agree before a block is
          accepted, and signs every record with the official&rsquo;s digital key.
        </p>
      </div>
    </div>
  );
}
