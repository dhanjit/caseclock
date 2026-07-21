/**
 * Interconnectivity map (V4-DELTA N4 / V6 "Links") — cross-case identifiers.
 * Auto-fed from every case's CDR/IPDR/IMEI registers: the same phone/IMEI in two
 * or more cases is a lead. List-first (the graph canvas is a later polish).
 */
import { useMemo, useState } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { allIdentifierLinks, crossCaseLinks } from "@/domain/links";
import { TopBar } from "@/features/components/TopBar";

export function LinksView() {
  const aggregates = useCases((s) => s.aggregates);
  const go = useNav((s) => s.go);
  const [showAll, setShowAll] = useState(false);
  const links = useMemo(
    () => (showAll ? allIdentifierLinks(aggregates) : crossCaseLinks(aggregates)),
    [aggregates, showAll],
  );

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col px-4 pb-16 pt-5">
      <TopBar title="Links" subtitle="Interconnectivity map — common phone numbers & IMEIs across cases" />
      <p className="mt-3 rounded-lg border border-court/30 bg-blue-bg/60 px-3 py-2 text-sm leading-snug">
        Auto-fed from every case's CDR / IPDR / IMEI registers. A link is drawn when the same
        identifier surfaces in <b>two or more cases</b> — the moment a shared handset or SIM becomes
        a lead. No raw CDR is ingested; the map reflects only what is entered.
      </p>
      <div className="mt-3">
        <button
          onClick={() => setShowAll((s) => !s)}
          className={`rounded border px-3 py-1.5 font-mono text-xs ${showAll ? "border-ink bg-ink text-surface" : "border-line text-ink"}`}
        >
          {showAll ? "Showing all identifiers" : "Showing cross-case only"}
        </button>
      </div>

      {links.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-line bg-surface-2 px-6 py-10 text-center text-sm text-ink-dim">
          {showAll
            ? "No identifiers entered yet — add CDR/IPDR/IMEI requests on a case's Comms panel."
            : "No identifier yet appears in more than one case. Cross-case links surface here automatically as comms data is entered."}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {links.map((l) => (
          <div
            key={`${l.kind}:${l.value}`}
            className={`rounded-xl border bg-surface-2 p-3 ${l.cases.length > 1 ? "border-l-4 border-critical" : "border-line"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${l.kind === "imei" ? "bg-brass-bg text-statutory" : "bg-blue-bg text-court"}`}
              >
                {l.kind === "imei" ? "IMEI" : "Phone"}
              </span>
              <span className="font-mono text-sm font-bold">{l.value}</span>
              {l.cases.length > 1 && (
                <span className="ml-auto rounded bg-critical px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  in {l.cases.length} cases
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {l.cases.map((c) => (
                <button
                  key={c.caseId}
                  onClick={() => go({ kind: "case", id: c.caseId })}
                  className="rounded border border-court/50 px-2.5 py-1 text-xs text-court hover:bg-blue-bg"
                  title={c.note}
                >
                  {c.firNumber} ›
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
