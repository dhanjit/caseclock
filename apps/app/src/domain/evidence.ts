/**
 * Pure evidence rules (REQUIREMENTS §4.1 / heading 9). Lifted out of EvidencePanel.tsx
 * so the briefing builder and the screen share one source of truth and never drift.
 */

import type { EvidenceRecord } from "./types";
import { addDays, diffDays, type ISODate } from "@/rules/dates";

/** §4.1: an expert report pending beyond 2 days from forwarding is overdue (RED). */
export function expertReportOverdue(e: EvidenceRecord, today: ISODate): boolean {
  if (e.reportKind !== "expert" || !e.forwardedDate || e.status === "received") return false;
  return diffDays(today, addDays(e.forwardedDate, 2)) >= 0;
}
