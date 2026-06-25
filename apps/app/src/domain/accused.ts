import type { AccusedStatus } from "./types";

/**
 * The officer's 11 accused statuses (REQUIREMENTS §6), each with a distinct,
 * fixed colour. Class strings are written literally so Tailwind's scanner emits
 * them. `tone` is the dot/badge colour family.
 */
export interface AccusedStatusMeta {
  label: string;
  badge: string; // pill classes
  meaning: string;
}

export const ACCUSED_STATUS_ORDER: AccusedStatus[] = [
  "police_custody",
  "judicial_custody",
  "not_arrested",
  "absconding",
  "killed",
  "surrendered",
  "approver",
  "charge_sheeted",
  "under_investigation",
  "acquitted",
  "dropped",
];

export const ACCUSED_STATUS_META: Record<AccusedStatus, AccusedStatusMeta> = {
  police_custody: { label: "Police custody", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", meaning: "Currently in police custody." },
  judicial_custody: { label: "Judicial custody", badge: "bg-blue-500/15 text-blue-300 border-blue-500/30", meaning: "Currently in judicial custody." },
  not_arrested: { label: "Not arrested", badge: "bg-slate-500/15 text-slate-300 border-slate-500/30", meaning: "Named but not yet arrested." },
  absconding: { label: "Absconding", badge: "bg-red-500/15 text-red-300 border-red-500/30", meaning: "Evading arrest / whereabouts unknown." },
  killed: { label: "Killed / Dead", badge: "bg-zinc-600/25 text-zinc-200 border-zinc-500/40", meaning: "Deceased." },
  surrendered: { label: "Surrendered", badge: "bg-teal-500/15 text-teal-300 border-teal-500/30", meaning: "Voluntarily surrendered." },
  approver: { label: "Approver", badge: "bg-violet-500/15 text-violet-300 border-violet-500/30", meaning: "Turned approver / prosecution witness." },
  charge_sheeted: { label: "Charge-sheeted", badge: "bg-green-500/15 text-green-300 border-green-500/30", meaning: "Charge sheet filed against the accused." },
  under_investigation: { label: "Under investigation", badge: "bg-yellow-500/15 text-yellow-200 border-yellow-500/30", meaning: "Role still under investigation." },
  acquitted: { label: "Acquitted", badge: "bg-sky-500/15 text-sky-300 border-sky-500/30", meaning: "Court tried and found not guilty." },
  dropped: { label: "Dropped", badge: "bg-stone-500/15 text-stone-300 border-stone-500/30", meaning: "Name removed / not sent for trial (e.g. insufficient evidence, FR closure)." },
};

/** Fallback so a stale/unknown persisted status never hard-crashes the UI. */
const UNKNOWN_STATUS_META: AccusedStatusMeta = {
  label: "Unknown",
  badge: "bg-surface-3 text-soft border-line",
  meaning: "Status not recognised (possibly from an older record).",
};

export function accusedStatusMeta(s: AccusedStatus | string | null | undefined): AccusedStatusMeta {
  return (s && ACCUSED_STATUS_META[s as AccusedStatus]) || UNKNOWN_STATUS_META;
}

export function accusedStatusLabel(s: AccusedStatus | undefined): string {
  return s ? accusedStatusMeta(s).label : "—";
}
