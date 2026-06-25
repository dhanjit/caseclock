/** Sanctions — statutory + DG, tracked required/pending/obtained (REQUIREMENTS §5). */

import type { CaseAggregate } from "@/domain/repository";
import type { CaseRecord, SanctionStatus } from "@/domain/types";
import { Section } from "@/features/components/bits";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";
const STATUSES: SanctionStatus[] = ["na", "required", "pending", "obtained"];
const LABEL: Record<SanctionStatus, string> = { na: "N/A", required: "Required", pending: "Pending", obtained: "Obtained" };
const TONE: Record<SanctionStatus, string> = {
  na: "text-soft",
  required: "text-statutory",
  pending: "text-critical",
  obtained: "text-ok",
};

export function SanctionsPanel({
  agg,
  onSaveCase,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
}) {
  const c = agg.case;
  const statutory = c.sanctionStatutory ?? "na";
  const dg = c.sanctionDg ?? "na";

  return (
    <Section title="Sanctions" hint="statutory + DG" className="mt-3">
      <div className="space-y-3">
        <Sanction label="Statutory sanction (e.g. s.45 UAPA)" value={statutory} tone={TONE[statutory]} onChange={(v) => onSaveCase({ sanctionStatutory: v })} />
        <Sanction label="DG sanction" value={dg} tone={TONE[dg]} onChange={(v) => onSaveCase({ sanctionDg: v })} />

        {/* UAPA s.45 working-day clocks (engine-driven): each step is ≤7 working days. */}
        <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
          <DateField label="Evidence → Authority" value={c.evidenceToAuthorityDate ?? ""} onChange={(v) => onSaveCase({ evidenceToAuthorityDate: v || null })} />
          <DateField label="Rule 3 recommendation" value={c.rule3RecommendationDate ?? ""} onChange={(v) => onSaveCase({ rule3RecommendationDate: v || null })} />
          <DateField label="Rule 4 sanction" value={c.rule4SanctionDate ?? ""} onChange={(v) => onSaveCase({ rule4SanctionDate: v || null })} />
        </div>

        <textarea
          className={`${input} w-full min-h-[48px] resize-y`}
          value={c.sanctionNote ?? ""}
          onChange={(e) => onSaveCase({ sanctionNote: e.target.value || undefined })}
          placeholder="Sanction notes (authority, file ref, dates…)"
        />
      </div>
    </Section>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-dim">
      {label}
      <input type="date" className={input} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Sanction({ label, value, tone, onChange }: { label: string; value: SanctionStatus; tone: string; onChange: (v: SanctionStatus) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-dim">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${tone}`}>{LABEL[value]}</span>
        <select className={input} value={value} onChange={(e) => onChange(e.target.value as SanctionStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
