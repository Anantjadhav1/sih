"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { RISK_COLORS, RISK_MEANING } from "@/lib/districts";
import { fetchLedger } from "@/lib/ledger";
import type { Block, BlockCheck } from "@/lib/ledger";

/**
 * A printable one-page report of one sealed decision: /report?block=N
 *
 * It is generated from the blockchain record, not from the live simulator, so
 * every number on the page is exactly what was sealed - and the page prints the
 * block's fingerprint, so anyone holding the paper can check it against the
 * ledger later. "Save as PDF" is the browser's own print dialog; no PDF library.
 */

const nf = new Intl.NumberFormat("en-IN");

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-b border-neutral-200 last:border-0">
      <th className="w-[38%] py-2 pr-4 text-left align-top text-[12px] font-normal text-neutral-500">
        {label}
      </th>
      <td className="py-2 text-[13px] text-neutral-900">{children}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="border-b-2 border-neutral-900 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ReportPage() {
  const [block, setBlock] = useState<Block | null>(null);
  const [check, setCheck] = useState<BlockCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    // Read the query string directly rather than via useSearchParams, which
    // would force a Suspense boundary onto this statically built page.
    const index = Number(new URLSearchParams(window.location.search).get("block"));
    fetchLedger()
      .then((ledger) => {
        const b = ledger.blocks.find((x) => x.index === index);
        if (!b || b.data.type !== "policy_decision") {
          setError(`There is no sealed decision at block #${index}.`);
          return;
        }
        setBlock(b);
        setCheck(ledger.verification.blocks.find((c) => c.index === index) ?? null);
      })
      .catch(() => setError("Could not reach the ledger. Is FastAPI running on :8000?"));
  }, []);

  const d = block?.data;
  const intact = check !== null && check.problem === null;
  const ok = RISK_COLORS.Low;
  const bad = RISK_COLORS.High;

  return (
    <div className="min-h-screen bg-neutral-300 py-8 print:bg-white print:py-0">
      {/* Screen-only toolbar */}
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-2 print:hidden">
        <a href="/" className="text-sm text-neutral-700 hover:underline">
          &larr; Back to the platform
        </a>
        {block && (
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Print / Save as PDF
          </button>
        )}
      </div>

      <article className="mx-auto min-h-[297mm] max-w-[210mm] bg-white px-12 py-10 text-neutral-900 shadow-xl print:min-h-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-500">
              National Digital Platform for Land Governance
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Policy Decision Report</h1>
          </div>
          {block && (
            <p className="text-right font-mono text-[11px] text-neutral-500">
              Block #{block.index}
              <br />
              {fullDate(block.timestamp)}
            </p>
          )}
        </header>

        {error && <p className="mt-8 text-sm text-neutral-700">{error}</p>}
        {!error && !block && <p className="mt-8 text-sm text-neutral-500">Loading record&hellip;</p>}

        {block && d && (
          <>
            {/* Integrity first: is what follows exactly what was sealed? */}
            <div
              className="mt-5 rounded-md border-2 px-4 py-3"
              style={{ borderColor: intact ? ok : bad }}
            >
              <p className="text-sm font-semibold" style={{ color: intact ? ok : bad }}>
                {intact
                  ? "✓ Verified against the blockchain: this record is intact"
                  : "✗ Warning: this record failed blockchain verification"}
              </p>
              <p className="mt-0.5 text-[12px] text-neutral-600">
                {intact
                  ? `Every fingerprint and link was rechecked on ${fullDate(checkedAt)}.`
                  : check?.problem}
              </p>
            </div>

            <div className="mt-7">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: d.decision === "approved" ? ok : bad }}
              >
                {d.decision === "approved" ? "Approved" : "Rejected"}
              </p>
              <p className="mt-1 text-lg font-medium leading-snug">
                {d.lever_label}, {d.conversion_pct}% of land in {d.scope}
              </p>
            </div>

            <Section title="What was decided">
              <table className="mt-1 w-full">
                <tbody>
                  <Row label="Policy">{d.lever_label}</Row>
                  <Row label="Location">{d.scope}</Row>
                  <Row label="Amount of land converted">{d.conversion_pct}%</Row>
                  <Row label="Monsoon strength">
                    {d.monsoon_intensity?.toFixed(2)}&times; a normal year
                  </Row>
                  <Row label="Population growth">
                    {d.population_growth_rate?.toFixed(1)}% per year
                  </Row>
                  <Row label="Decided by">
                    {d.recorded_by}
                    {d.recorded_by_user && (
                      <span className="font-mono text-[12px] text-neutral-500">
                        {" "}
                        ({d.recorded_by_user})
                      </span>
                    )}
                  </Row>
                </tbody>
              </table>
            </Section>

            <Section title="The risk it was decided on">
              <table className="mt-1 w-full">
                <tbody>
                  <Row label="Overall risk score">
                    <span className="font-semibold">{d.risk_score} / 100</span> &middot;{" "}
                    {d.risk_level}
                    <span className="block text-[12px] text-neutral-600">
                      {RISK_MEANING[d.risk_level ?? "Low"]}
                    </span>
                  </Row>
                  <Row label="Extra flood risk">+{d.flood_risk_increase_pct}%</Row>
                  <Row label="People displaced">
                    {nf.format(d.displacement_persons ?? 0)} people
                  </Row>
                  {d.land_lost_hectares !== undefined && (
                    <Row label={d.land_label ?? "Land lost"}>
                      {nf.format(d.land_lost_hectares)} hectares
                    </Row>
                  )}
                  {d.biodiversity_impact_score != null && (
                    <Row label="Biodiversity impact">{d.biodiversity_impact_score} / 100</Row>
                  )}
                </tbody>
              </table>
            </Section>

            <Section title="Blockchain seal">
              <table className="mt-1 w-full">
                <tbody>
                  <Row label="Block number">#{block.index}</Row>
                  <Row label="Sealed on">{fullDate(block.timestamp)}</Row>
                  <Row label="Fingerprint (hash)">
                    <span className="break-all font-mono text-[11px]">{block.hash}</span>
                  </Row>
                  <Row label="Previous block's fingerprint">
                    <span className="break-all font-mono text-[11px] text-neutral-600">
                      {block.previous_hash}
                    </span>
                  </Row>
                  <Row label="Proof of work">
                    Found after {nf.format(block.nonce + 1)} tries
                  </Row>
                </tbody>
              </table>
            </Section>

            <section className="mt-7 break-inside-avoid rounded-md bg-neutral-100 px-4 py-3">
              <h2 className="text-[12px] font-semibold">How to check this report is genuine</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-neutral-700">
                Open the platform&rsquo;s <strong>Blockchain Ledger</strong> tab and type the
                fingerprint above into <strong>Check a report</strong>. If it matches an intact
                block, every number on this page is exactly what was sealed. If anyone has
                edited the record since, the check will say so.
              </p>
            </section>

            <footer className="mt-8 border-t border-neutral-300 pt-3 text-[10px] text-neutral-500">
              Generated {fullDate(checkedAt)} from the blockchain record. Simulation figures come
              from the platform&rsquo;s demonstration model.
            </footer>
          </>
        )}
      </article>
    </div>
  );
}
