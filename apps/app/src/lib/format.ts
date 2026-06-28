import { diffDays, todayISO, type ISODate } from "@/rules/dates";
import type { CaseRecord, DeadlineTrack, Severity } from "@/domain/types";

/** Dashboard / agenda case label — FIR + station, with the identity appended so a
 * watchlisted name in it auto-REDs on the screens that scan it first (§4 / §5). */
export function caseLabel(c: Pick<CaseRecord, "firNumber" | "policeStation" | "identity">): string {
  const head = c.policeStation ? `FIR ${c.firNumber} · ${c.policeStation}` : `FIR ${c.firNumber}`;
  return c.identity ? `${head} — ${c.identity}` : head;
}

/** Investigation-vs-trial tag (§4) shown on every deadline. */
export const TRACK_META: Record<DeadlineTrack, { short: string; pill: string }> = {
  investigation: { short: "INV", pill: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  trial: { short: "TRIAL", pill: "bg-court/15 text-court border-court/30" },
  court: { short: "COURT", pill: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  superior: { short: "SC/HC", pill: "bg-critical/15 text-critical border-critical/40" },
  supervisory: { short: "SUPV", pill: "bg-soft/15 text-soft border-soft/30" },
  process: { short: "REQ", pill: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: ISODate | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function relativeDays(date: ISODate, today: ISODate = todayISO()): string {
  const d = diffDays(date, today);
  if (d === 0) return "today";
  if (d > 0) return `in ${d} day${d > 1 ? "s" : ""}`;
  const n = -d;
  return `${n} day${n > 1 ? "s" : ""} ago`;
}

/** Tailwind tone keyed to severity (matches the theme tokens in index.css). */
export function severityTone(s: Severity): "critical" | "statutory" | "court" | "soft" {
  switch (s) {
    case "statutory-critical":
      return "critical";
    case "statutory":
    case "statutory-condonable":
      return "statutory";
    case "court":
      return "court";
    default:
      return "soft";
  }
}

export const toneText: Record<"critical" | "statutory" | "court" | "soft", string> = {
  critical: "text-critical",
  statutory: "text-statutory",
  court: "text-court",
  soft: "text-soft",
};

export const toneBg: Record<"critical" | "statutory" | "court" | "soft", string> = {
  critical: "bg-critical",
  statutory: "bg-statutory",
  court: "bg-court",
  soft: "bg-soft",
};
