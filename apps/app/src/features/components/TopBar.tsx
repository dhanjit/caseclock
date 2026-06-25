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
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-court/15 text-court">
          <ClockGlyph />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-ink-dim">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

export function btn(variant: "primary" | "ghost" | "icon" = "ghost"): string {
  if (variant === "primary") return "rounded-lg bg-court px-3 py-1.5 text-sm font-medium text-white hover:opacity-90";
  if (variant === "icon") return "grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-dim hover:text-ink";
  return "rounded-lg border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink";
}
