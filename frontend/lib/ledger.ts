/**
 * Client for the blockchain ledger of policy decisions (backend/blockchain.py).
 * Reading and verifying are open to everyone; only officials may record.
 */
import { apiError } from "@/lib/apiError";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface DecisionData {
  type: "genesis" | "policy_decision" | "ground_truth";
  title: string;
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
  recomputed_hash: string;
  problem: string | null;
}

export interface Verification {
  valid: boolean;
  first_broken_index: number | null;
  checked_blocks: number;
  blocks: BlockCheck[];
}

export interface LedgerState {
  difficulty: number;
  blocks: Block[];
  verification: Verification;
}

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
  token: string
) {
  return call<LedgerState & { block: Block }>(
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
      }),
    },
    token
  );
}

export const tamperBlock = (index: number, reseal: boolean) =>
  call<LedgerState>("/api/ledger/tamper", {
    method: "POST",
    body: JSON.stringify({ index, reseal }),
  });

export const restoreLedger = () =>
  call<LedgerState>("/api/ledger/restore", { method: "POST" });

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
