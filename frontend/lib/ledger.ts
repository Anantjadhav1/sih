/**
 * Client for the blockchain ledger of policy decisions (backend/blockchain.py).
 * Three offices each hold a copy; `blocks` and `verification` describe the copy
 * most of them agree on. Reading and verifying are open to everyone; only
 * officials may record decisions.
 */
import { apiError } from "@/lib/apiError";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

/** An account registered in the first block, with its public key. */
export interface Member {
  username: string;
  name: string;
  role: string;
  public_key: string;
}

export interface Signature {
  signer: string;
  algorithm: string;
  value: string;
}

export interface DecisionData {
  type: "genesis" | "policy_decision" | "ground_truth";
  title: string;
  /** Genesis only: who may sign, and the rules every office enforces */
  members?: Member[];
  rule_book?: string[];
  /** Every record after the first is signed by the account that made it */
  signature?: Signature;
  /** Why the official decided this way (required for High-risk approvals) */
  reason?: string;
  // Citizen ground-truth photo blocks
  category?: string;
  note?: string;
  lat?: number;
  lng?: number;
  photo_file?: string;
  photo_sha256?: string;
  decision?: "approved" | "rejected";
  lever_label?: string;
  scope?: string;
  conversion_pct?: number;
  risk_score?: number;
  risk_level?: string;
  flood_risk_increase_pct?: number;
  displacement_persons?: number;
  /** Signed-in account that sealed the block (from the server-verified pass) */
  recorded_by_user?: string;
  monsoon_intensity?: number;
  population_growth_rate?: number;
  // Present on blocks sealed after reports were added
  land_label?: string;
  land_lost_hectares?: number;
  biodiversity_impact_score?: number | null;
  recorded_by?: string;
}

export interface Block {
  index: number;
  timestamp: string;
  data: DecisionData;
  previous_hash: string;
  nonce: number;
  hash: string;
}

export interface BlockCheck {
  index: number;
  fingerprint_ok: boolean;
  link_ok: boolean;
  work_ok: boolean;
  /** Was it signed by a registered account, and does the signature still fit? */
  signature_ok: boolean;
  signer: string | null;
  recomputed_hash: string;
  problem: string | null;
}

export interface Verification {
  valid: boolean;
  first_broken_index: number | null;
  checked_blocks: number;
  blocks: BlockCheck[];
}

export type OfficeStatus = "agrees" | "tampered" | "outvoted";

/** One office in the network and its own copy of the chain. */
export interface Office {
  id: string;
  name: string;
  /** agrees = holds the majority copy; tampered = its own copy fails checks;
   *  outvoted = its copy checks out on its own but differs from the majority */
  status: OfficeStatus;
  length: number;
  tip_hash: string | null;
  chain: Block[];
  verification: Verification;
}

export interface LedgerNetwork {
  offices: Office[];
  has_majority: boolean;
  all_agree: boolean;
  rule_book: string[];
  min_reason_chars: number;
}

/** How one office voted on a proposed block. */
export interface Vote {
  office: string;
  name: string;
  accepted: boolean;
  reason: string | null;
}

export interface LedgerState {
  difficulty: number;
  /** The agreed chain - what every other part of the app reads */
  blocks: Block[];
  verification: Verification;
  network: LedgerNetwork;
}

export type Attack = "edit" | "rewrite" | "erase";

export interface DecisionScenario {
  pct: number;
  district: string;
  zone: string | null;
  lever: string;
  monsoonIntensity: number;
  populationGrowthRate: number;
}

async function call<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // The signed pass from sign-in; the server reads the role from it
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw await apiError(res, "Ledger request failed");
  return res.json();
}

export const fetchLedger = () => call<LedgerState>("/api/ledger");

export function recordDecision(
  scenario: DecisionScenario,
  decision: "approved" | "rejected",
  token: string,
  reason = ""
) {
  return call<LedgerState & { block: Block; votes: Vote[] }>(
    "/api/ledger/record",
    {
      method: "POST",
      body: JSON.stringify({
        // The server re-runs this scenario itself, so the sealed numbers can't
        // be edited in the browser on the way in.
        simulation: {
          agri_to_commercial_pct: scenario.pct,
          district: scenario.district,
          zone: scenario.zone,
          policy_lever: scenario.lever,
          monsoon_intensity: scenario.monsoonIntensity,
          population_growth_rate: scenario.populationGrowthRate,
        },
        decision,
        reason,
      }),
    },
    token
  );
}

/** DEMO ONLY: an insider attacks one office's copy. */
export const tamperOffice = (office: string, index: number, attack: Attack) =>
  call<LedgerState>("/api/ledger/tamper", {
    method: "POST",
    body: JSON.stringify({ office, index, attack }),
  });

/** The office throws its copy away and downloads the one most offices hold. */
export const repairOffice = (office: string) =>
  call<LedgerState>("/api/ledger/repair", {
    method: "POST",
    body: JSON.stringify({ office }),
  });

/** The registered account that signed a block, looked up in the first block. */
export function signerOf(blocks: Block[], block: Block): Member | null {
  const username = block.data.signature?.signer;
  return blocks[0]?.data.members?.find((m) => m.username === username) ?? null;
}

/** First and last few characters - enough to compare two hashes by eye. */
export function shortHash(h: string): string {
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

export type ReportCheck =
  | { kind: "genuine"; block: Block }
  | { kind: "altered"; block: Block; problem: string }
  | { kind: "unknown"; chainBrokenAt: number | null }
  | { kind: "invalid-input" };

/**
 * Is a report genuine? Look its printed fingerprint up on the ledger.
 *
 * Accepts the full 64-character hash or the short "000a84f2…bb49" form shown
 * on screen, so someone can type it straight off a printout.
 */
export function checkReportHash(ledger: LedgerState, raw: string): ReportCheck {
  const input = raw.trim().toLowerCase().replace(/\s+/g, "");
  const [head, tail] = input.split(/…|\.\.\./);
  if (!/^[0-9a-f]{8,64}$/.test(head) || (tail !== undefined && !/^[0-9a-f]{1,56}$/.test(tail))) {
    return { kind: "invalid-input" };
  }

  const block = ledger.blocks.find(
    (b) => b.hash.startsWith(head) && (tail === undefined || b.hash.endsWith(tail))
  );
  if (!block) {
    // A forger who re-mined a block changed its hash, so a genuine old report
    // no longer matches anything - say the ledger is the suspect, not the paper.
    return { kind: "unknown", chainBrokenAt: ledger.verification.first_broken_index };
  }

  const check = ledger.verification.blocks.find((c) => c.index === block.index);
  if (check?.problem) return { kind: "altered", block, problem: check.problem };
  return { kind: "genuine", block };
}
