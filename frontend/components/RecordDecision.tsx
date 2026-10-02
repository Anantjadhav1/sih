"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Blocks, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAuthError } from "@/lib/apiError";
import { recordDecision, shortHash } from "@/lib/ledger";
import type { Block, DecisionScenario, Vote } from "@/lib/ledger";
import { RISK_COLORS } from "@/lib/districts";
import { useRole } from "@/lib/roles";

const nf = new Intl.NumberFormat("en-IN");

/** Mirrors the ledger's rule book - the offices themselves enforce it. */
const MIN_REASON_CHARS = 20;

/**
 * Step 4 of the Simulator: an official approves or rejects the scenario on
 * screen. The decision is signed with the official's key and sent to every
 * office holding the ledger; it becomes a block once most of them accept it.
 */
export default function RecordDecision({
  scenario,
  riskLevel,
  disabled,
  onOpenLedger,
}: {
  scenario: DecisionScenario;
  /** Risk level of the scenario on screen - a High-risk approval needs a reason */
  riskLevel?: string | null;
  disabled: boolean;
  onOpenLedger?: () => void;
}) {
  const { role, token, signOut } = useRole();
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [sealed, setSealed] = useState<Block | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A sealed receipt describes one scenario; clear it once the scenario moves
  const scenarioKey = JSON.stringify(scenario);
  useEffect(() => {
    setSealed(null);
    setVotes([]);
    setError(null);
  }, [scenarioKey]);

  const needsReason = riskLevel === "High" && reason.trim().length < MIN_REASON_CHARS;

  async function seal(decision: "approved" | "rejected") {
    if (!token) return;
    setBusy(decision);
    setError(null);
    try {
      const res = await recordDecision(scenario, decision, token, reason);
      setSealed(res.block);
      setVotes(res.votes ?? []);
      setReason("");
    } catch (e) {
      // The server refused the pass (expired or invalid) - sign in again
      if (isAuthError(e)) return signOut();
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Blocks className="h-3.5 w-3.5 text-primary" />
        Seal this decision on the blockchain
      </p>

      {role?.canRecord ? (
        <>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Approve or reject this scenario. The decision, your reason and its risk numbers
            are signed with your key and become a new block that nobody can quietly change.
          </p>

          {sealed ? (
            <div className="mt-2.5 rounded-md border border-border bg-background/40 px-3 py-2">
              <p className="text-[11px] font-medium text-primary">
                ✓ Sealed in Block #{sealed.index} as{" "}
                {sealed.data.decision === "approved" ? "approved" : "rejected"}, signed with
                your key
              </p>
              {votes.length > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Accepted by {votes.filter((v) => v.accepted).length} of {votes.length} offices:{" "}
                  {votes.map((v, i) => (
                    <span key={v.office}>
                      {i > 0 && " · "}
                      <span style={{ color: v.accepted ? RISK_COLORS.Low : RISK_COLORS.High }}>
                        {v.accepted ? "✓" : "✗"}
                      </span>{" "}
                      <span title={v.reason ?? v.name}>
                        {v.office.charAt(0).toUpperCase() + v.office.slice(1)}
                      </span>
                    </span>
                  ))}
                </p>
              )}
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                hash {shortHash(sealed.hash)} &middot; found after{" "}
                {nf.format(sealed.nonce + 1)} tries
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                <a
                  href={`/report?block=${sealed.index}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <FileText className="h-3 w-3" /> Download report
                </a>
                {onOpenLedger && (
                  <button
                    type="button"
                    onClick={onOpenLedger}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    See it on the ledger <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              aria-label="Reason for this decision"
              placeholder="Reason for this decision (recorded on the ledger)"
              className="mt-2.5 w-full resize-none rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] outline-none focus:border-primary/50"
            />
            {needsReason && (
              <p className="mt-1 text-[10px] leading-relaxed" style={{ color: RISK_COLORS.Moderate }}>
                This scenario is High risk. The ledger&rsquo;s rule book says approving it needs
                a reason of at least {MIN_REASON_CHARS} characters - every office checks this.
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="h-8 text-[11px]"
                disabled={disabled || busy !== null}
                onClick={() => seal("approved")}
              >
                {busy === "approved" ? "Mining block…" : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-[11px]"
                disabled={disabled || busy !== null}
                onClick={() => seal("rejected")}
              >
                {busy === "rejected" ? "Mining block…" : "Reject"}
              </Button>
            </div>
            </>
          )}
        </>
      ) : (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Only government officials can seal decisions. Anyone can read and verify the
            ledger{onOpenLedger ? " - " : "."}
            {onOpenLedger && (
              <button
                type="button"
                onClick={onOpenLedger}
                className="font-medium text-primary hover:underline"
              >
                open it
              </button>
            )}
          </span>
        </p>
      )}

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
    </section>
  );
}
