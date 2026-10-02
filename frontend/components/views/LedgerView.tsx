"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Blocks,
  BookCheck,
  Building2,
  CircleCheck,
  CircleX,
  FileText,
  Fingerprint,
  KeyRound,
  Link as LinkIcon,
  Pickaxe,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RISK_COLORS, riskColor } from "@/lib/districts";
import {
  checkReportHash,
  fetchLedger,
  repairOffice,
  shortHash,
  signerOf,
  tamperOffice,
} from "@/lib/ledger";
import type {
  Attack,
  Block,
  BlockCheck,
  LedgerState,
  Office,
  OfficeStatus,
  ReportCheck,
} from "@/lib/ledger";
import { photoUrl } from "@/lib/groundTruth";
import { useRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

// Chain health is a status, so it reuses the status ramp - always with an
// icon and a written label, never colour alone.
const OK = RISK_COLORS.Low;
const WARN = RISK_COLORS.Moderate;
const BAD = RISK_COLORS.High;

const nf = new Intl.NumberFormat("en-IN");

const CONCEPTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Blocks,
    title: "Block",
    text: "One sealed record: the decision, the numbers behind it, who made it and when.",
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
  {
    icon: KeyRound,
    title: "Digital signature",
    text: "Each record is signed with its author's private key. Edit it and the signature no longer fits - and nobody else can re-sign it.",
  },
  {
    icon: Users,
    title: "Consensus",
    text: "Three offices each keep a copy. A block is added only when most of them accept it, and the copy most offices hold is the true one.",
  },
];

const STATUS: Record<OfficeStatus, { label: string; color: string; icon: LucideIcon }> = {
  agrees: { label: "Agrees", color: OK, icon: CircleCheck },
  tampered: { label: "Tampered - fails its own checks", color: BAD, icon: CircleX },
  outvoted: { label: "Outvoted - differs from the others", color: WARN, icon: CircleX },
};

const ATTACKS: { id: Attack; label: string; caughtBy: string; how: string }[] = [
  {
    id: "edit",
    label: "Edit a record",
    caughtBy: "the fingerprint",
    how: "Change the risk score and leave the hash alone. The contents no longer match their fingerprint.",
  },
  {
    id: "rewrite",
    label: "Edit and re-mine the chain",
    caughtBy: "the signature, and the other offices",
    how: "Change the risk score, then redo the proof of work for that block and every one after it, so all hashes and links fit again. But the official never signed those numbers, and only their key could.",
  },
  {
    id: "erase",
    label: "Erase a record",
    caughtBy: "the other offices",
    how: "Delete a decision and rebuild everything after it. Every hash, link and signature on this copy checks out - only the other two offices, who still hold the record, give it away.",
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

/** Who signed a block, and whether the signature still fits its contents. */
function SignatureLine({ chain, block, check }: { chain: Block[]; block: Block; check: BlockCheck }) {
  const member = signerOf(chain, block);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px]">
      <KeyRound className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">Signed by</span>
      <span>{member ? `${member.name} (${member.username})` : block.data.signature?.signer ?? "nobody"}</span>
      <span className="font-medium" style={{ color: check.signature_ok ? OK : BAD }}>
        {check.signature_ok ? "✓ signature fits" : "✗ signature doesn't fit"}
      </span>
    </p>
  );
}

/** The first block: the registered accounts with their public keys, and the rules. */
function GenesisDetails({ block }: { block: Block }) {
  const members = block.data.members ?? [];
  return (
    <div className="mt-2 space-y-2 text-[11px]">
      <p className="text-muted-foreground">
        Holds the public key of every account allowed to sign, so nobody can quietly swap one
        later.
      </p>
      <ul className="grid gap-1 sm:grid-cols-3">
        {members.map((m) => (
          <li key={m.username} className="rounded-md border border-border bg-background/40 px-2 py-1">
            <span className="font-medium">{m.name}</span>
            <span className="block font-mono text-[10px] text-muted-foreground">
              key {shortHash(m.public_key)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockCard({ chain, block, check }: { chain: Block[]; block: Block; check: BlockCheck }) {
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
        {d.type === "ground_truth" && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Citizen photo
          </span>
        )}
        {d.type === "policy_decision" && (
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

      {isGenesis ? (
        <GenesisDetails block={block} />
      ) : (
        <h3 className="mt-2 text-sm font-medium leading-snug">{d.title}</h3>
      )}

      {d.type === "ground_truth" && d.photo_file && (
        <div className="mt-2 flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl(d.photo_file)}
            alt={`${d.category} reported by ${d.recorded_by}`}
            className="h-16 w-24 shrink-0 rounded object-cover"
          />
          <dl className="space-y-0.5 text-[11px]">
            {d.note && <dd className="text-muted-foreground">&ldquo;{d.note}&rdquo;</dd>}
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Photo fingerprint</dt>
              <dd className="font-mono">{shortHash(d.photo_sha256 ?? "")}</dd>
            </div>
          </dl>
        </div>
      )}

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
        </dl>
      )}
      {d.reason && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Reason: <span className="text-foreground">&ldquo;{d.reason}&rdquo;</span>
        </p>
      )}

      {!isGenesis && <SignatureLine chain={chain} block={block} check={check} />}

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

/** One office's card: its status, and a button to view its copy. */
function OfficeCard({
  office,
  selected,
  onSelect,
}: {
  office: Office;
  selected: boolean;
  onSelect: () => void;
}) {
  const s = STATUS[office.status];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-1 rounded-lg border bg-surface-2/50 p-3 text-left transition-colors hover:border-primary/40",
        selected && "ring-1 ring-primary/50"
      )}
      style={{ borderColor: office.status === "agrees" ? undefined : s.color }}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Building2 className="h-3.5 w-3.5 text-primary" />
        {office.name}
      </span>
      <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: s.color }}>
        <s.icon className="h-3.5 w-3.5" />
        {s.label}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {office.length} blocks &middot; newest {office.tip_hash ? shortHash(office.tip_hash) : "-"}
      </span>
      <span className="text-[10px] text-primary">{selected ? "Showing this copy below" : "View this copy"}</span>
    </button>
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
          `Every number on that report is exactly what was sealed and agreed by the offices: ${result.block.data.title}.`}
        {result.kind === "altered" && `${result.problem} Repair the offices and check again.`}
        {result.kind === "unknown" &&
          (result.chainBrokenAt !== null
            ? `The ledger itself fails verification at Block #${result.chainBrokenAt}. Repair the offices and check again.`
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
  // or repairing an office updates an already-checked report straight away.
  const [checkedHash, setCheckedHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  // Whose copy is shown, and which copy/block the insider attacks
  const [viewed, setViewed] = useState("central");
  const [attackOffice, setAttackOffice] = useState("district");
  const [target, setTarget] = useState(1);

  const run = useCallback(
    async (fn: () => Promise<LedgerState>, message?: string, show?: string) => {
      setBusy(true);
      setError(null);
      try {
        setLedger(await fn());
        setLastAction(message ?? null);
        if (show) setViewed(show);
      } catch (e) {
        setError((e as Error).message || "Could not reach the ledger. Is FastAPI running on :8000?");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    run(fetchLedger);
  }, [run]);

  const net = ledger?.network;
  const offices = net?.offices ?? [];
  const shown = offices.find((o) => o.id === viewed) ?? offices[0];
  const disagreeing = offices.filter((o) => o.status !== "agrees");
  const agreeing = offices.length - disagreeing.length;
  const attacker = offices.find((o) => o.id === attackOffice);
  const tamperable = (attacker?.chain ?? []).filter((b) => b.index > 0);
  const agreedLength = ledger?.blocks.length ?? 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Blockchain Ledger</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Every policy an official approves or rejects is signed and sealed here together with
            the risk numbers it was decided on, alongside the fingerprint of every citizen photo.
            Three offices each keep a copy and check every block. You are viewing as{" "}
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
        {net && (
          <section
            className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
            style={{
              borderColor: net.all_agree ? `${OK}66` : `${BAD}88`,
              backgroundColor: net.all_agree ? `${OK}12` : `${BAD}14`,
            }}
          >
            {net.all_agree ? (
              <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: OK }} />
            ) : (
              <ShieldAlert className="h-5 w-5 shrink-0" style={{ color: BAD }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {net.all_agree
                  ? `All ${offices.length} offices agree - all ${agreedLength} blocks verified`
                  : net.has_majority
                    ? `The ${disagreeing.map((o) => o.name).join(" and ")}'s copy was tampered with - outvoted ${agreeing} to ${disagreeing.length}`
                    : "The offices don't agree on the chain"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {net.all_agree
                  ? "Every office re-checked every fingerprint, link, proof of work and signature just now."
                  : net.has_majority
                    ? "The agreed record is unaffected: most offices still hold the same intact chain, and that is what the rest of the platform reads."
                    : "With no majority there is no agreed record - the reason real networks spread copies across many offices."}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-[11px]"
              disabled={busy}
              onClick={() => run(fetchLedger, "Every office re-verified its copy.")}
            >
              Verify again
            </Button>
            {net.has_majority &&
              disagreeing.map((o) => (
                <Button
                  key={o.id}
                  size="sm"
                  className="h-8 gap-1.5 text-[11px]"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => repairOffice(o.id),
                      `The ${o.name} threw its copy away and downloaded the one the other offices agree on.`,
                      o.id
                    )
                  }
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Repair from the other offices
                </Button>
              ))}
          </section>
        )}
        {lastAction && <p className="mt-2 text-[11px] text-muted-foreground">{lastAction}</p>}

        {/* ---- The offices holding copies ---- */}
        {offices.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-semibold">
              Who holds a copy{" "}
              <span className="font-normal text-muted-foreground">
                &middot; a block is added only when most offices accept it
              </span>
            </h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {offices.map((o) => (
                <OfficeCard
                  key={o.id}
                  office={o}
                  selected={o.id === shown?.id}
                  onSelect={() => setViewed(o.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ---- The six ideas, in plain language ---- */}
        <section className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* ---- The rule book: a smart contract in plain words ---- */}
        {net && (
          <section className="mt-2 rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <BookCheck className="h-3.5 w-3.5 text-primary" />
              Rule book
              <span className="font-normal text-muted-foreground">
                &middot; written into the first block; every office refuses a block that breaks
                a rule (a simple smart contract)
              </span>
            </p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[11px] text-muted-foreground">
              {net.rule_book.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </section>
        )}

        {/* ---- One office's copy of the chain, oldest first ---- */}
        {shown && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold">
              The chain as the {shown.name} holds it{" "}
              <span className="font-normal text-muted-foreground">
                &middot; {shown.chain.length} blocks, oldest first
              </span>
            </h2>
            {shown.status === "outvoted" && (
              <p
                className="mt-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed"
                style={{ borderColor: `${WARN}66`, backgroundColor: `${WARN}14` }}
              >
                Every block on this copy passes its own checks - but it has {shown.chain.length}{" "}
                blocks where the other offices have {agreedLength}, and its newest hash differs
                from theirs. A record was erased here; the majority outvotes it.
              </p>
            )}
            <div className="mt-3">
              {shown.chain.map((b, i) => {
                const check = shown.verification.blocks.find((c) => c.index === b.index);
                if (!check) return null;
                return (
                  <div key={`${shown.id}-${b.index}`}>
                    {i > 0 && <LinkConnector prev={shown.chain[i - 1]} block={b} check={check} />}
                    <BlockCard chain={shown.chain} block={b} check={check} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2.5 font-mono text-[11px] outline-none focus:border-primary/50 sm:min-w-[16rem]"
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
        {offices.length > 0 && (
          <section className="mt-6 rounded-lg border border-dashed border-border bg-surface-2/30 p-4">
            <h2 className="text-xs font-semibold">Try to cheat the ledger</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Pretend you are a corrupt insider with direct access to one office&rsquo;s
              computer, trying to make a risky decision look safe - or make it disappear.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={attackOffice}
                onChange={(e) => {
                  setAttackOffice(e.target.value);
                  setTarget(1);
                }}
                aria-label="Office to attack"
                className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[11px]"
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                aria-label="Block to attack"
                className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[11px]"
              >
                {tamperable.map((b) => (
                  <option key={b.index} value={b.index}>
                    Block #{b.index}
                  </option>
                ))}
              </select>
            </div>
            <ul className="mt-3 space-y-2">
              {ATTACKS.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-52 shrink-0 text-[11px]"
                    disabled={busy || tamperable.length === 0}
                    onClick={() =>
                      run(
                        () => tamperOffice(attackOffice, target, a.id),
                        `${a.label}: Block #${target} on the ${attacker?.name}'s copy. Caught by ${a.caughtBy}.`,
                        attackOffice
                      )
                    }
                  >
                    {a.label}
                  </Button>
                  <p className="min-w-0 flex-1 basis-60 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Caught by {a.caughtBy}.</span>{" "}
                    {a.how}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-[10px] leading-relaxed text-muted-foreground">
          In this demo the three offices run inside one server so you can watch them side by
          side; in production each runs on its own office&rsquo;s server and they exchange blocks
          over the network. Signing keys are derived by the server here; in production each
          official signs with their own Digital Signature Certificate (DSC) token.
        </p>
      </div>
    </div>
  );
}
