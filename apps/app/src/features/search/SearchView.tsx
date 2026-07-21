/**
 * Global search route (REQUIREMENTS §9). A full-page lookup over all cases via the
 * pure searchCases() matcher (structured fields only — never document contents).
 * Each result row deep-links to the case. Watchlist names auto-RED via <Highlighted>.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useCases } from "@/state/cases";
import { useWatchlist } from "@/state/watchlist";
import { useNav } from "@/state/nav";
import { searchCases, type SearchField } from "@/domain/search";
import { Highlighted } from "@/features/components/Highlighted";
import { TopBar, btn } from "@/features/components/TopBar";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

const FIELD_LABEL: Record<SearchField, string> = {
  firNumber: "case no",
  identity: "identity",
  section: "section",
  accused: "accused",
  date: "date",
  court: "court",
  request: "ref no",
  watchlist: "banned org",
};

const FIELD_BADGE: Record<SearchField, string> = {
  watchlist: "border-critical/50 bg-critical/15 text-critical",
  firNumber: "border-court/40 bg-court/15 text-court",
  request: "border-violet-500/40 bg-violet-100 text-violet-900",
  accused: "border-court/40 bg-court/15 text-court",
  identity: "border-line bg-surface-3 text-ink-dim",
  section: "border-statutory/40 bg-statutory/15 text-statutory",
  court: "border-slate-500/40 bg-slate-200 text-slate-700",
  date: "border-line bg-surface-3 text-ink-dim",
};

/** Mark the query inside a snippet (T3 / V6 hlText) — case-insensitive, safe. */
function Marked({ text, q }: { text: string; q: string }) {
  const query = q.trim();
  if (!query) return <Highlighted text={text} />;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <Highlighted text={text} />;
  return (
    <>
      <Highlighted text={text.slice(0, idx)} />
      <mark className="rounded-sm bg-brass-bg px-0.5 text-ink">{text.slice(idx, idx + query.length)}</mark>
      <Highlighted text={text.slice(idx + query.length)} />
    </>
  );
}

export function SearchView() {
  const aggregates = useCases((s) => s.aggregates);
  const names = useWatchlist((s) => s.names);
  const view = useNav((s) => s.view);
  const go = useNav((s) => s.go);

  const seeded = (view as { q?: string }).q ?? "";
  const [q, setQ] = useState(seeded);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const hits = useMemo(() => searchCases(aggregates, q, names), [aggregates, q, names]);
  // Grouped by case (T3 / V6 searchAll): case header + its hits beneath, keeping
  // the score order for the group ordering (best case first).
  const groups = useMemo(() => {
    const byCase = new Map<string, { caseLabel: string; hits: typeof hits }>();
    for (const h of hits) {
      const g = byCase.get(h.caseId) ?? { caseLabel: h.caseLabel, hits: [] };
      g.hits.push(h);
      byCase.set(h.caseId, g);
    }
    return [...byCase.entries()].map(([caseId, g]) => ({ caseId, ...g }));
  }, [hits]);
  const trimmed = q.trim();

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pb-24 pt-5">
      <TopBar
        title="Search"
        subtitle="case no · accused · section · ref no · date · court · banned org"
        actions={
          <button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>
            Back
          </button>
        }
      />

      <div className="mt-4">
        <input
          ref={ref}
          className={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search across all cases…"
          aria-label="Search cases"
        />
        <p className="mt-1 px-1 text-[11px] text-soft">Structured fields only — never document contents (§9).</p>
      </div>

      <div className="mt-3 space-y-2">
        {trimmed === "" ? (
          <p className="py-10 text-center text-sm text-soft">Type to search cases.</p>
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-soft">No matches for “{trimmed}”.</p>
        ) : (
          <>
            <p className="px-1 font-mono text-[11px] text-ink-dim">
              {hits.length} hit(s) in {groups.length} case(s)
            </p>
            {groups.map((g) => (
              <div key={g.caseId} className="rounded-xl border border-line bg-surface-2 p-2">
                <button
                  onClick={() => go({ kind: "case", id: g.caseId })}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-surface-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    <Marked text={g.caseLabel} q={trimmed} />
                  </span>
                  <span className="shrink-0 rounded bg-brass-bg px-1.5 py-0.5 font-mono text-[10px] font-bold text-statutory">
                    {g.hits.length}
                  </span>
                </button>
                <div className="mt-1 space-y-1">
                  {g.hits.map((h, i) => (
                    <button
                      key={`${h.field}:${i}`}
                      onClick={() => go({ kind: "case", id: h.caseId })}
                      className="flex w-full items-center gap-2.5 rounded-lg border-l-2 border-surface-3 px-2 py-1.5 text-left hover:bg-surface-3"
                    >
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${FIELD_BADGE[h.field]}`}>
                        {FIELD_LABEL[h.field]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        <Marked text={h.snippet} q={trimmed} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
