import type { ReactNode } from "react";

export function ClockGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TopBar({
  title,
  subtitle,
  actions,
  below,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Optional second row inside the sticky header (e.g. the case-section TOC). */
  below?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-surface px-4">
      <div className="flex items-center justify-between gap-2 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Round brass monogram — the ledger identity mark (design-direction §1). */}
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-brass/60 text-brass">
            <ClockGlyph />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-tight font-semibold">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-ink-dim">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {below}
    </header>
  );
}

export function btn(variant: "primary" | "ghost" | "icon" = "ghost"): string {
  if (variant === "primary") return "rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-surface hover:opacity-90";
  if (variant === "icon")
    return "grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-ink-dim hover:bg-surface-3 hover:text-ink";
  return "rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink-dim hover:bg-surface-3 hover:text-ink";
}
