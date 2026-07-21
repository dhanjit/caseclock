/**
 * FR-I → sanction pipeline stepper (V4-DELTA N10 / V6 "attached panels"):
 * FR-I submitted → [UAPA: custody-ext (day 75) → FR-II → SP remarks] → DG approval
 * (≤7d) → IR for MHA (≤7d) → MHA sanction. Steps are gated in order; each records
 * its date; overdue steps flag on the dashboard via the engine rules. Footer per
 * V6: "Chargesheet may be filed after MHA sanction."
 */
import type { CaseAggregate } from "@/domain/repository";
import { chargesheetFiled } from "@/domain/repository";
import { custodyLimits, earliestArrest, type CaseRecord } from "@/domain/types";
import { addDays, diffDays, todayISO } from "@/rules/dates";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";

const input = "w-full rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-court";

interface Step {
  key: keyof CaseRecord;
  label: string;
  date: string | null | undefined;
  due?: string | null; // reminder line while unset
  enabled: boolean;
}

export function PipelinePanel({
  agg,
  onSaveCase,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
}) {
  const c = agg.case;
  const today = todayISO();
  const anchor = earliestArrest(c, agg.persons);
  const isUapa = custodyLimits(c).caseType === "uapa";
  const csDone = chargesheetFiled(agg);
  const dg = c.dgApprovedDate ?? c.dgOrderDate;

  if (!anchor) {
    return (
      <Section title="FR-I → sanction pipeline" hint="arrest → chargesheet" className="mt-3">
        <p className="text-sm italic text-ink-dim">
          No arrest recorded yet — the pipeline begins once an accused is marked arrested (heading 12).
        </p>
      </Section>
    );
  }

  const lim = custodyLimits(c);
  const steps: Step[] = [
    { key: "frISubmittedDate", label: "FR-I submitted", date: c.frISubmittedDate, due: addDays(anchor, lim.buffered), enabled: true },
    ...(isUapa
      ? ([
          { key: "custodyExtFiledDate", label: "Custody extension 90→180 filed (day 75)", date: c.custodyExtFiledDate, due: addDays(anchor, 75), enabled: true },
          { key: "frIIFiledDate", label: "FR-II submitted", date: c.frIIFiledDate, due: addDays(anchor, lim.buffered), enabled: !!c.frISubmittedDate },
          { key: "spRemarksDate", label: "SP remarks", date: c.spRemarksDate, due: addDays(anchor, lim.buffered), enabled: !!c.frISubmittedDate },
        ] as Step[])
      : []),
    { key: "dgApprovedDate", label: "DG approval of FR-I (≤7d)", date: dg, due: c.frISubmittedDate ? addDays(c.frISubmittedDate, 7) : null, enabled: !!c.frISubmittedDate },
    { key: "irForMhaDate", label: "IR for MHA sanction (≤7d)", date: c.irForMhaDate, due: dg ? addDays(dg, 7) : null, enabled: !!dg },
    { key: "mhaSanctionDate", label: "MHA sanction obtained", date: c.mhaSanctionDate, due: c.irForMhaDate ? addDays(c.irForMhaDate, 7) : null, enabled: !!c.irForMhaDate },
  ];

  return (
    <Section
      title="FR-I → sanction pipeline"
      hint={csDone ? "chargesheet filed — pipeline closed" : `earliest arrest ${fmtDate(anchor)} · FR line ${fmtDate(addDays(anchor, lim.buffered))}`}
      className="mt-3"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => {
          const overdue = !s.date && s.due && diffDays(today, s.due) > 0;
          return (
            <div
              key={String(s.key)}
              className={`rounded-lg border p-2 ${s.date ? "border-ok/40 bg-green-bg/60" : s.enabled ? (overdue ? "border-critical/50 bg-red-bg/50" : "border-line bg-surface-2") : "border-line bg-surface-3 opacity-60"}`}
            >
              <p className="text-[11px] font-semibold leading-tight">{s.label}</p>
              {s.date ? (
                <p className="mt-1 inline-block rounded bg-green-bg px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ok">
                  {fmtDate(s.date)}
                </p>
              ) : (
                <>
                  {s.due && (
                    <p className={`mt-1 font-mono text-[10px] ${overdue ? "font-bold text-critical" : "text-ink-dim"}`}>
                      due {fmtDate(s.due)}{overdue ? " · OVERDUE" : ""}
                    </p>
                  )}
                  {s.enabled ? (
                    <input
                      type="date"
                      className={`${input} mt-1`}
                      value=""
                      onChange={(e) => e.target.value && void onSaveCase({ [s.key]: e.target.value } as Partial<CaseRecord>)}
                      aria-label={`${s.label} — date`}
                    />
                  ) : (
                    <p className="mt-1 text-[10px] italic text-ink-dim">awaiting previous step</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="eyebrow mt-2">
        Chargesheet may be filed after MHA sanction. Each step records its date; overdue steps flag on the dashboard{csDone ? "" : " while the case is in arrest stage"}.
      </p>
    </Section>
  );
}
