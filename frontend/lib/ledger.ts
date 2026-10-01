/**
 * Client for the blockchain ledger of policy decisions (backend/blockchain.py).
 * Reading and verifying are open to everyone; only officials may record.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface DecisionData {
  type: "genesis" | "policy_decision";
  title: string;
  decision?: "approved" | "rejected";
  lever_label?: string;
  scope?: string;
  conversion_pct?: number;
  risk_score?: number;
  risk_level?: string;
  flood_risk_increase_pct?: number;
  displacement_persons?: number;
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Ledger request failed (${res.status})`);
  }
  return res.json();
}

export const fetchLedger = () => call<LedgerState>("/api/ledger");

export function recordDecision(
  scenario: DecisionScenario,
  decision: "approved" | "rejected",
  role: string
) {
  return call<LedgerState & { block: Block }>("/api/ledger/record", {
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
      role,
    }),
  });
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
