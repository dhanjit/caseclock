/**
 * Briefing-note print view (REQUIREMENTS §8). Renders the pure buildBriefing() output
 * — a header block + the officer's 13 fixed headings — as signature-ready, black-on-white
 * A4 HTML, mounted via a portal into the #print-root div (the @media print rules in
 * index.css hide #root, reveal #print-root and force black-on-white inside .briefing-note).
 *
 * Lifecycle: add the `print-active` body class, then rAF → window.print() so the layout
 * has painted. On `afterprint` (or a fallback timeout, since WKWebView on iPad may never
 * fire it) we tear down the class + listener and call onDone(). A visible "Close" button
 * is the manual escape hatch for the same iPad case.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CaseAggregate } from "@/domain/repository";
import { buildBriefing } from "@/domain/briefing";
import { todayISO } from "@/rules/dates";
import { useCio } from "@/state/cio";
import { useWatchlist } from "@/state/watchlist";
import { Highlighted } from "@/features/components/Highlighted";

const PRINT_FALLBACK_MS = 60_000;

export function BriefingNote({ agg, onDone }: { agg: CaseAggregate; onDone: () => void }) {
  const officers = useCio((s) => s.officers);
  const watchlist = useWatchlist((s) => s.names);
  const note = buildBriefing(agg, todayISO(), officers, watchlist);
  // Latch onDone so the listener/timeout always see the current callback without
  // re-registering the print lifecycle on every render.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finishedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
      document.body.classList.remove("print-active");
      doneRef.current();
    };
    window.addEventListener("afterprint", finish);
    // Fallback for WKWebView (iPad), where `afterprint` is not guaranteed to fire.
    timer = setTimeout(finish, PRINT_FALLBACK_MS);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
      document.body.classList.remove("print-active");
    };
  }, []);

  // The body class MUST be added before window.print() runs, and the print CSS
  // gates the whole note->A4 swap on it. useLayoutEffect runs (and its rAF fires)
  // before the passive useEffect above, so add the class HERE — otherwise the
  // first print could render the dark SPA instead of the note.
  useLayoutEffect(() => {
    document.body.classList.add("print-active");
    const raf = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Manual escape hatch (iPad/WKWebView): mark finished so the afterprint listener
  // early-returns; the effect cleanup removes the listener + body class on unmount.
  function closeNow() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    document.body.classList.remove("print-active");
    onDone();
  }

  const root = typeof document !== "undefined" ? document.getElementById("print-root") : null;
  if (!root) return null;

  const { header, headings } = note;

  return createPortal(
    <div className="briefing-note">
      <button type="button" onClick={closeNow} className="briefing-close" data-print-hide>
        Close
      </button>

      <header className="briefing-header">
        <h1>Case briefing note</h1>
        <p className="briefing-case-label">
          <Highlighted text={header.caseLabel} />
        </p>
        <dl className="briefing-meta">
          <div>
            <dt>Case number</dt>
            <dd>{header.firNumber}</dd>
          </div>
          <div>
            <dt>Identity</dt>
            <dd>
              <Highlighted text={header.identity} />
            </dd>
          </div>
          <div>
            <dt>Date of registration</dt>
            <dd>{header.firDate}</dd>
          </div>
          <div>
            <dt>UAPA</dt>
            <dd>{header.uapa ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Default bail</dt>
            <dd>{header.defaultBailLine}</dd>
          </div>
        </dl>
      </header>

      {headings.map((h) => (
        <section key={h.n} className="briefing-heading">
          <h2>
            {h.n}. {h.title}
          </h2>
          <ul>
            {h.lines.map((line, i) => (
              <li key={i}>
                <Highlighted text={line} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>,
    root,
  );
}
