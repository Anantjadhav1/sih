"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Blocks, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordDecision, shortHash } from "@/lib/ledger";
import type { Block, DecisionScenario } from "@/lib/ledger";
import { useRole } from "@/lib/roles";

const nf = new Intl.NumberFormat("en-IN");

/**
 * Step 4 of the Simulator: an official approves or rejects the scenario on
 * screen, and the decision is sealed as a new block on the ledger.
 */
export default function RecordDecision({
  scenario,
  disabled,
  onOpenLedger,
}: {
  scenario: DecisionScenario;
  disabled: boolean;
  onOpenLedger?: () => void;
}) {
  const { role } = useRole();
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [sealed, setSealed] = useState<Block | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A sealed receipt describes one scenario; clear it once the scenario moves
  const scenarioKey = JSON.stringify(scenario);
  useEffect(() => {
    setSealed(null);
    setError(null);
  }, [scenarioKey]);

  async function seal(decision: "approved" | "rejected") {
    if (!role) return;
    setBusy(decision);
    setError(null);
    try {
      const res = await recordDecision(scenario, decision, role.id);
      setSealed(res.block);
    } catch (e) {
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
            Approve or reject this scenario. The decision and its risk numbers become a new
            block that nobody can quietly change later.
          </p>

          {sealed ? (
            <div className="mt-2.5 rounded-md border border-border bg-background/40 px-3 py-2">
              <p className="text-[11px] font-medium text-primary">
                ✓ Sealed in Block #{sealed.index} as{" "}
                {sealed.data.decision === "approved" ? "approved" : "rejected"}
              </p>
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
            <div className="mt-2.5 grid grid-cols-2 gap-2">
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
