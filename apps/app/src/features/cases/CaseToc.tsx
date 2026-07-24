/**
 * Sticky in-case jump nav (design-direction §3 "In-case navigation"): the case
 * page is one long ledger; this rail keeps every section one tap away and shows
 * where you are. Lives inside the sticky TopBar (its `below` slot); chips scroll
 * horizontally, scrollspy tracks the section currently under the header.
 */
import { useEffect, useRef, useState } from "react";

export interface TocItem {
  id: string;
  label: string;
}

/** Anchor targets clear the sticky header (title row + rail ≈ 110px) with room. */
export const TOC_SCROLL_MARGIN = "scroll-mt-32";

/* Self-driven scroll glide. Native `behavior:"smooth"` is not dependable across
   embedded WebViews (and a smooth scrollIntoView walks every scrollable ancestor,
   so concurrent ones cancel each other) — a 200–400ms rAF ease is deterministic.
   Newer glides on the same element+axis supersede in-flight ones. */
const gliding = new WeakMap<HTMLElement, { top?: number; left?: number }>();
let glideSeq = 0;
function glide(el: HTMLElement, axis: "top" | "left", to: number) {
  const state = gliding.get(el) ?? {};
  const token = ++glideSeq;
  state[axis] = token;
  gliding.set(el, state);
  const from = axis === "top" ? el.scrollTop : el.scrollLeft;
  const delta = to - from;
  if (Math.abs(delta) < 1) return;
  const set = (v: number) => {
    if (axis === "top") el.scrollTop = v;
    else el.scrollLeft = v;
  };
  // rAF never fires in hidden documents (background/embedded WebViews) — land
  // instantly there, and snap via watchdog if the document hides mid-glide.
  if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    set(to);
    return;
  }
  const dur = Math.min(420, 160 + Math.abs(delta) * 0.05);
  const start = performance.now();
  const step = (now: number) => {
    if (gliding.get(el)?.[axis] !== token) return;
    const t = Math.min(1, (now - start) / dur);
    set(from + delta * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  window.setTimeout(() => {
    if (gliding.get(el)?.[axis] === token) set(to);
  }, dur + 120);
}

export function CaseToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const railRef = useRef<HTMLElement>(null);

  // Scrollspy on the app scroll container (<main>): the last section whose top
  // has passed under the header band is "current". ~20 rect reads per scroll
  // event is well inside frame budget.
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const scroller = els[0].closest("main");
    if (!scroller) return;
    const spy = () => {
      let current = items[0]?.id ?? "";
      for (const el of els) {
        if (el.getBoundingClientRect().top <= 140) current = el.id;
        else break;
      }
      setActive(current);
    };
    spy();
    scroller.addEventListener("scroll", spy, { passive: true });
    return () => scroller.removeEventListener("scroll", spy);
  }, [items]);

  // Keep the active chip centred in the rail (rail-scoped — never touches the
  // page scroll, so it can't cancel an in-flight section jump).
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-toc="${CSS.escape(active)}"]`);
    if (!rail || !chip) return;
    glide(rail, "left", chip.offsetLeft - rail.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2);
  }, [active]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    const scroller = el?.closest("main");
    if (!el || !scroller) return;
    setActive(id); // highlight on tap; the spy confirms as the scroll settles
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - margin;
    glide(scroller as HTMLElement, "top", top);
  };

  return (
    <nav
      ref={railRef}
      aria-label="Case sections"
      className="-mx-4 flex gap-1 overflow-x-auto border-t border-line/60 px-4 py-1.5 [scrollbar-width:none]"
    >
      {items.map((i) => (
        <button
          key={i.id}
          data-toc={i.id}
          onClick={() => jump(i.id)}
          aria-current={active === i.id ? "true" : undefined}
          className={`shrink-0 rounded px-2 py-1 font-mono text-[10.5px] tracking-wide whitespace-nowrap uppercase ${
            active === i.id ? "bg-ink font-semibold text-surface" : "text-ink-dim hover:bg-surface-3 hover:text-ink"
          }`}
        >
          {i.label}
        </button>
      ))}
    </nav>
  );
}
