/**
 * Sanctions (REQUIREMENTS §5 + V4-DELTA §3) — an open LIST of sanction items
 * ("Statutory (UAPA s.45)", "DG sanction", …), each cycled Pending → Required →
 * Obtained per the V6 preview. Legacy fixed fields migrate into the list on
 * hydration. The s.45 working-day clocks stay engine-driven below.
 */
import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { CaseRecord, SanctionItem } from "@/domain/types";
import { todayISO } from "@/rules/dates";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { DeferredTextarea } from "@/features/components/DeferredInput";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

const NEXT: Record<SanctionItem["state"], SanctionItem["state"]> = {
  pending: "required",
  required: "obtained",
  obtained: "pending",
};
const TONE: Record<SanctionItem["state"], string> = {
  pending: "bg-brass-bg text-statutory",
  required: "bg-red-bg text-critical",
  obtained: "bg-green-bg text-ok",
};

export function SanctionsPanel({
  agg,
  onSaveCase,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
}) {
  const c = agg.case;
  const items = c.sanctions ?? [];
  const today = todayISO();
  const [kind, setKind] = useState("");
  const [state, setState] = useState<SanctionItem["state"]>("pending");

  const save = (sanctions: SanctionItem[]) => onSaveCase({ sanctions });
  const cycle = (id: string) =>
    save(
      items.map((s) => {
        if (s.id !== id) return s;
        const next = NEXT[s.state];
        return { ...s, state: next, date: next === "obtained" ? today : null };
      }),
    );
  async function add() {
    if (!kind.trim()) return;
    await save([...items, { id: newId("sn"), kind: kind.trim(), state, date: state === "obtained" ? today : null }]);
    setKind("");
    setState("pending");
  }

  return (
    <Section title="Sanctions" hint={`${items.length} tracked · tap a status to cycle`} className="mt-3">
      <div className="space-y-1.5">
        {items.length === 0 && <p className="py-1 text-sm italic text-ink-dim">None tracked yet.</p>}
        {items.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-lg bg-surface-3/50 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 text-sm">{s.kind}</span>
            {s.date && <span className="shrink-0 font-mono text-[10.5px] text-ink-dim">{fmtDate(s.date)}</span>}
            <button
              onClick={() => void cycle(s.id)}
              title="Tap to cycle Pending → Required → Obtained"
              className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${TONE[s.state]}`}
            >
              {s.state}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input className={`${input} min-w-44 flex-1 py-1.5 text-xs`} value={kind} onChange={(e) => setKind(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder='Add sanction (e.g. "Statutory (UAPA s.45)")' />
        <select className={`${input} py-1.5 text-xs`} value={state} onChange={(e) => setState(e.target.value as SanctionItem["state"])} aria-label="Initial state">
          <option value="pending">Pending</option>
          <option value="required">Required</option>
          <option value="obtained">Obtained</option>
        </select>
        <button onClick={() => void add()} disabled={!kind.trim()} className={`${btn("ghost")} disabled:opacity-40`}>+ Add</button>
      </div>

      {/* UAPA s.45 working-day clocks (engine-driven): each step is ≤7 working days. */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <DateField label="Evidence → Authority" value={c.evidenceToAuthorityDate ?? ""} onChange={(v) => onSaveCase({ evidenceToAuthorityDate: v || null })} />
        <DateField label="Rule 3 recommendation" value={c.rule3RecommendationDate ?? ""} onChange={(v) => onSaveCase({ rule3RecommendationDate: v || null })} />
        <DateField label="Rule 4 sanction" value={c.rule4SanctionDate ?? ""} onChange={(v) => onSaveCase({ rule4SanctionDate: v || null })} />
      </div>

      <DeferredTextarea
        className={`${input} mt-2 w-full min-h-[48px] resize-y`}
        value={c.sanctionNote ?? ""}
        onCommit={(v) => onSaveCase({ sanctionNote: v || undefined })}
        placeholder="Sanction notes (authority, file ref, dates…)"
        aria-label="Sanction notes"
      />
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
