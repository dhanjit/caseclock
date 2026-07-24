/**
 * Tiny dependency-free dropdown for secondary header actions — keeps toolbars to
 * a few visible controls without native menus (no prompt/alert/confirm anywhere).
 */
import { useEffect, useRef, useState } from "react";
import { btn } from "./TopBar";

export interface MenuItem {
  label: string;
  onClick: () => void;
  title?: string;
}

export function MoreMenu({ label = "⋯", title = "More actions", items }: { label?: string; title?: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={title} className={btn("icon")}>
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 min-w-44 rounded-lg border border-line bg-surface-2 py-1 shadow-lg shadow-ink/10">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              title={it.title}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-3"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
