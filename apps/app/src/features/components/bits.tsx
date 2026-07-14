import type { ReactNode } from "react";
import type { AgendaItem } from "@/rules/agenda";
import { relativeDays, severityTone, toneBg, toneText, TRACK_META } from "@/lib/format";
import { Highlighted } from "./Highlighted";

export function Dot({ tone }: { tone: "critical" | "statutory" | "court" | "soft" }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${toneBg[tone]}`} />;
}

export function Section({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface-2 p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ink-dim uppercase">{title}</h2>
        {hint ? <span className="text-xs text-soft">{hint}</span> : null}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-dim">{label}</span>
      {children}
    </label>
  );
}

export function AgendaRow({
  item,
  today,
  onOpen,
}: {
  item: AgendaItem;
  today: string;
  onOpen: (caseId: string) => void;
}) {
  const tone = severityTone(item.deadline.severity);
  const d = item.deadline;
  return (
    <button
      onClick={() => onOpen(item.caseId)}
      className="flex w-full items-center gap-3 rounded-xl bg-surface-3/50 px-3 py-2.5 text-left hover:bg-surface-3"
    >
      <Dot tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm text-ink">
          <span className={`shrink-0 rounded border px-1 py-0.5 text-[10px] font-medium ${TRACK_META[d.track].pill}`}>
            {TRACK_META[d.track].short}
          </span>
          <span className="truncate">{d.type}</span>
        </p>
        <p className="truncate text-xs text-ink-dim">
          {/* Short label (FIR · PS) — the offence blurb after " — " repeats on every
              row of a case and just adds noise in a long agenda. */}
          <Highlighted text={item.caseLabel.split(" — ")[0]} />
          {d.owes ? ` · owes: ${d.owes}` : ""}
          {d.verified === "uncertain" ? " · verify before relying" : ""}
        </p>
      </div>
      <span className={`shrink-0 text-xs font-medium ${toneText[tone]}`}>
        {d.dueAt ? relativeDays(d.dueAt, today) : d.state}
      </span>
    </button>
  );
}
