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
  "convicted",
  "dropped",
];

export const ACCUSED_STATUS_META: Record<AccusedStatus, AccusedStatusMeta> = {
  // Ledger light theme (design-direction §1): dark text on tinted paper pills.
  police_custody: { label: "Police custody", badge: "bg-amber-100 text-amber-900 border-amber-700/30", meaning: "Currently in police custody." },
  judicial_custody: { label: "Judicial custody", badge: "bg-blue-100 text-blue-900 border-blue-700/30", meaning: "Currently in judicial custody." },
  not_arrested: { label: "Not arrested", badge: "bg-stone-100 text-stone-700 border-stone-400/40", meaning: "Named but not yet arrested." },
  absconding: { label: "Absconding", badge: "bg-red-100 text-red-900 border-red-700/30", meaning: "Evading arrest / whereabouts unknown." },
  killed: { label: "Killed / Dead", badge: "bg-zinc-200 text-zinc-800 border-zinc-500/40", meaning: "Deceased." },
  surrendered: { label: "Surrendered", badge: "bg-teal-100 text-teal-900 border-teal-700/30", meaning: "Voluntarily surrendered." },
  approver: { label: "Approver", badge: "bg-violet-100 text-violet-900 border-violet-700/30", meaning: "Turned approver / prosecution witness." },
  charge_sheeted: { label: "Charge-sheeted", badge: "bg-green-100 text-green-900 border-green-700/30", meaning: "Charge sheet filed against the accused." },
  under_investigation: { label: "Under investigation", badge: "bg-yellow-100 text-yellow-900 border-yellow-700/30", meaning: "Role still under investigation." },
  acquitted: { label: "Acquitted", badge: "bg-sky-100 text-sky-900 border-sky-700/30", meaning: "Court tried and found not guilty." },
  convicted: { label: "Convicted", badge: "bg-rose-100 text-rose-900 border-rose-700/30", meaning: "Court tried and convicted — record sentence + appeal window (V4-DELTA Q3)." },
  dropped: { label: "Dropped", badge: "bg-stone-200 text-stone-700 border-stone-400/40", meaning: "Name removed / not sent for trial (e.g. insufficient evidence, FR closure)." },
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
