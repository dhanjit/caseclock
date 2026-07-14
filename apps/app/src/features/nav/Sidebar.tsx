/**
 * Persistent, collapsible iPad sidebar — primary navigation + the case list, so
 * the officer never loses their way. Toggle («/») collapses it to a slim icon rail
 * to give the content the full width; the choice is remembered (state/ui.ts).
 */
import { useCases } from "@/state/cases";
import { useNav, type View } from "@/state/nav";
import { useSession } from "@/state/session";
import { useUI } from "@/state/ui";
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
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const activeCaseId = view.kind === "case" ? view.id : null;
  const pad = collapsed ? "justify-center px-0" : "px-2.5";

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-line bg-surface-2 transition-[width] duration-150 ${collapsed ? "w-14" : "w-60"}`}
    >
      <div className={`flex items-center py-3 ${collapsed ? "justify-center px-2" : "gap-2 px-3"}`}>
        {!collapsed && (
          <>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-court/15 text-court">
              <ClockGlyph />
            </span>
            <span className="flex-1 truncate text-lg font-semibold">CaseClock</span>
          </>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-dim hover:bg-surface-3 hover:text-ink"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="space-y-1 px-2">
        {NAV.map((n) => {
          const active = view.kind === n.view.kind;
          return (
            <button
              key={n.view.kind}
              onClick={() => go(n.view)}
              title={n.label}
              className={`flex w-full items-center gap-3 rounded-lg py-2 text-sm ${pad} ${active ? "bg-court/15 font-medium text-court" : "text-ink-dim hover:bg-surface-3 hover:text-ink"}`}
            >
              <span className="w-5 shrink-0 text-center">{n.icon}</span>
              {!collapsed && <span className="truncate">{n.label}</span>}
            </button>
          );
        })}
        <button
          onClick={() => go({ kind: "new" })}
          title="New case"
          className={`mt-1 flex w-full items-center gap-3 rounded-lg bg-court py-2 text-sm font-medium text-white hover:opacity-90 ${pad}`}
        >
          <span className="w-5 shrink-0 text-center">＋</span>
          {!collapsed && <span className="truncate">New case</span>}
        </button>
      </nav>

      {!collapsed && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
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
      )}

      <button
        onClick={() => void lock()}
        title="Lock vault"
        aria-label="Lock vault"
        className={`mt-auto flex items-center gap-3 border-t border-line py-3 text-sm text-ink-dim hover:text-ink ${collapsed ? "justify-center px-0" : "px-3"}`}
      >
        <span className="w-5 shrink-0 text-center">🔒</span>
        {!collapsed && <span>Lock</span>}
      </button>
    </aside>
  );
}
