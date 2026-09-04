"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * In-session record of what the analyst has actually run.
 *
 * Deliberately memory-only and deliberately not persisted: the Dashboard's
 * "simulations run this session" counter and activity feed should reset when
 * the session does, and there is no SimulationLogs table behind this MVP. The
 * production build writes these rows server-side against the logged-in user.
 */
export interface RunRecord {
  id: number;
  at: Date;
  leverId: string;
  leverLabel: string;
  scopeLabel: string;
  pct: number;
  riskScore: number;
  riskLevel: string;
}

interface SessionValue {
  runs: RunRecord[];
  recordRun: (r: Omit<RunRecord, "id" | "at">) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Cap the feed - the Dashboard only shows the newest few. */
const MAX_RUNS = 50;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);

  const recordRun = useCallback((r: Omit<RunRecord, "id" | "at">) => {
    setRuns((prev) => {
      const last = prev[0];
      // Dragging a slider fires a run per commit; collapse consecutive runs
      // that landed on the identical scenario so the feed stays readable.
      if (
        last &&
        last.leverId === r.leverId &&
        last.scopeLabel === r.scopeLabel &&
        last.pct === r.pct &&
        last.riskScore === r.riskScore
      ) {
        return prev;
      }
      const next: RunRecord = { ...r, id: (last?.id ?? 0) + 1, at: new Date() };
      return [next, ...prev].slice(0, MAX_RUNS);
    });
  }, []);

  const value = useMemo(() => ({ runs, recordRun }), [runs, recordRun]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
