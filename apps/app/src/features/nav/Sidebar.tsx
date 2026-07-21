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
  { view: { kind: "links" }, icon: "🔗", label: "Links" },
  { view: { kind: "calendar" }, icon: "📅", label: "Calendar" },
  { view: { kind: "cio" }, icon: "👮", label: "CIO" },
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
      className={`flex shrink-0 flex-col border-r-2 border-brass/60 bg-chrome text-chrome-ink transition-[width] duration-150 ${collapsed ? "w-14" : "w-60"}`}
    >
      <div className={`flex items-center py-3 ${collapsed ? "justify-center px-2" : "gap-2 px-3"}`}>
        {!collapsed && (
          <>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-chrome-dim text-chrome-dim">
              <ClockGlyph />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-semibold leading-tight">CaseClock</span>
              <span className="block truncate font-mono text-[9px] uppercase tracking-[0.18em] text-chrome-dim">
                Confidential · Offline
              </span>
            </span>
          </>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-chrome-dim hover:bg-chrome-2 hover:text-chrome-ink"
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
              className={`flex w-full items-center gap-3 rounded py-2 text-sm ${pad} ${active ? "bg-brass font-semibold text-chrome" : "text-chrome-ink/85 hover:bg-chrome-2 hover:text-chrome-ink"}`}
            >
              <span className="w-5 shrink-0 text-center">{n.icon}</span>
              {!collapsed && <span className="truncate">{n.label}</span>}
            </button>
          );
        })}
        <button
          onClick={() => go({ kind: "new" })}
          title="New case"
          className={`mt-1 flex w-full items-center gap-3 rounded border border-chrome-dim/60 py-2 text-sm font-medium text-chrome-dim hover:bg-chrome-2 hover:text-chrome-ink ${pad}`}
        >
          <span className="w-5 shrink-0 text-center">＋</span>
          {!collapsed && <span className="truncate">New case</span>}
        </button>
      </nav>

      {!collapsed && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-chrome-dim">
            Cases · {aggregates.length}
          </p>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {aggregates.map((a) => (
              <button
                key={a.case.id}
                onClick={() => go({ kind: "case", id: a.case.id })}
                title={caseLabel(a.case)}
                className={`flex w-full items-center gap-1.5 truncate rounded px-2.5 py-1.5 text-left text-xs ${activeCaseId === a.case.id ? "bg-chrome-2 text-chrome-ink" : "text-chrome-ink/70 hover:bg-chrome-2 hover:text-chrome-ink"}`}
              >
                {a.case.priority && <span className="shrink-0 text-chrome-dim">★</span>}
                <span className="truncate">{caseLabel(a.case)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => void lock()}
        title="Lock vault"
        aria-label="Lock vault"
        className={`mt-auto flex items-center gap-3 border-t border-chrome-line py-3 text-sm text-chrome-dim hover:text-chrome-ink ${collapsed ? "justify-center px-0" : "px-3"}`}
      >
        <span className="w-5 shrink-0 text-center">🔒</span>
        {!collapsed && <span>Lock</span>}
      </button>
    </aside>
  );
}
