/**
 * Persistent iPad sidebar — primary navigation + the case list, always visible so
 * the officer never loses their way (replaces the phone-style top-bar nav on wide
 * screens). Collapses to an icon rail below md; full rail + case list at md+.
 */
import { useCases } from "@/state/cases";
import { useNav, type View } from "@/state/nav";
import { useSession } from "@/state/session";
import { ClockGlyph } from "@/features/components/TopBar";
import { caseLabel } from "@/lib/format";

const NAV: { view: View; icon: string; label: string }[] = [
  { view: { kind: "dashboard" }, icon: "🏠", label: "Dashboard" },
  { view: { kind: "review" }, icon: "🗂", label: "Review" },
  { view: { kind: "search" }, icon: "🔍", label: "Search" },
  { view: { kind: "settings" }, icon: "⚙", label: "Settings" },
];

export function Sidebar() {
  const view = useNav((s) => s.view);
  const go = useNav((s) => s.go);
  const aggregates = useCases((s) => s.aggregates);
  const lock = useSession((s) => s.lock);
  const activeCaseId = view.kind === "case" ? view.id : null;

  return (
    <aside className="flex w-14 shrink-0 flex-col border-r border-line bg-surface-2 md:w-60">
      <div className="flex items-center gap-2.5 px-3 py-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-court/15 text-court">
          <ClockGlyph />
        </div>
        <span className="hidden text-lg font-semibold md:block">CaseClock</span>
      </div>

      <nav className="space-y-1 px-2">
        {NAV.map((n) => {
          const active = view.kind === n.view.kind;
          return (
            <button
              key={n.view.kind}
              onClick={() => go(n.view)}
              title={n.label}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm ${active ? "bg-court/15 font-medium text-court" : "text-ink-dim hover:bg-surface-3 hover:text-ink"}`}
            >
              <span className="w-5 shrink-0 text-center">{n.icon}</span>
              <span className="hidden truncate md:block">{n.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => go({ kind: "new" })}
          title="New case"
          className="mt-1 flex w-full items-center gap-3 rounded-lg bg-court px-2.5 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <span className="w-5 shrink-0 text-center">＋</span>
          <span className="hidden truncate md:block">New case</span>
        </button>
      </nav>

      <div className="mt-3 hidden min-h-0 flex-1 flex-col md:flex">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-soft">
          Cases · {aggregates.length}
        </p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {aggregates.map((a) => (
            <button
              key={a.case.id}
              onClick={() => go({ kind: "case", id: a.case.id })}
              title={caseLabel(a.case)}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs ${activeCaseId === a.case.id ? "bg-surface-3 text-ink" : "text-ink-dim hover:bg-surface-3 hover:text-ink"}`}
            >
              {caseLabel(a.case)}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => void lock()}
        title="Lock vault"
        aria-label="Lock vault"
        className="mt-auto flex items-center gap-3 border-t border-line px-3 py-3 text-sm text-ink-dim hover:text-ink"
      >
        <span className="w-5 shrink-0 text-center">🔒</span>
        <span className="hidden md:block">Lock</span>
      </button>
    </aside>
  );
}
