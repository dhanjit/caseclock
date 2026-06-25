/**
 * Hearings / Court matters (REQUIREMENTS §3.11, §4.2) + Superior Court Zone
 * entries (§2). Add hearings with a tier — routine, or superior (SC/HC).
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { HearingRecord } from "@/domain/types";
import { newId } from "@/lib/id";
import { fmtDate } from "@/lib/format";
import { Section } from "@/features/components/bits";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

const PURPOSES: HearingRecord["purpose"][] = [
  "bail",
  "trial",
  "remand",
  "framing",
  "deposition",
  "arguments",
  "slp",
  "writ",
  "other",
];

export function HearingsPanel({
  agg,
  onSaveHearings,
}: {
  agg: CaseAggregate;
  onSaveHearings: (hearings: HearingRecord[]) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [purpose, setPurpose] = useState<HearingRecord["purpose"]>("trial");
  const [superior, setSuperior] = useState(false);
  const [forum, setForum] = useState<"SC" | "HC">("HC");
  const [court, setCourt] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = [...agg.hearings].sort((a, b) => (a.hearingDate < b.hearingDate ? -1 : 1));

  async function add() {
    if (!date || busy) return;
    setBusy(true);
    const h: HearingRecord = {
      id: newId("h"),
      caseId: agg.case.id,
      hearingDate: date,
      purpose,
      court: court.trim() || undefined,
      ...(superior || purpose === "slp" || purpose === "writ" ? { tier: "superior", forum } : {}),
    };
    try {
      await onSaveHearings([...agg.hearings, h]);
      setDate("");
      setCourt("");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await onSaveHearings(agg.hearings.filter((h) => h.id !== id));
  }
  async function toggleDisposed(id: string) {
    await onSaveHearings(agg.hearings.map((h) => (h.id === id ? { ...h, disposed: !h.disposed } : h)));
  }

  return (
    <Section title="Court matters & hearings" hint={`${agg.hearings.length}`} className="mt-3">
      <div className="space-y-1.5">
        {sorted.map((h) => (
          <div key={h.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${h.disposed ? "bg-surface-3/20 opacity-60" : "bg-surface-3/40"}`}>
            <span className={`text-ink ${h.disposed ? "line-through" : ""}`}>{fmtDate(h.hearingDate)}</span>
            <span className="text-ink-dim">{h.purpose}</span>
            {h.tier === "superior" && (
              <span className="rounded border border-critical/40 bg-critical/15 px-1.5 py-0.5 text-[11px] text-critical">
                {h.forum ?? "SC/HC"}
              </span>
            )}
            {h.court && <span className="truncate text-xs text-soft"><Highlighted text={h.court} /></span>}
            <button
              onClick={() => toggleDisposed(h.id)}
              className={`ml-auto rounded border px-1.5 py-0.5 text-[11px] ${h.disposed ? "border-ok/40 bg-ok/15 text-ok" : "border-line text-ink-dim"}`}
              title="Mark heard / disposed"
            >
              {h.disposed ? "disposed" : "mark done"}
            </button>
            <button onClick={() => remove(h.id)} className="text-xs text-soft hover:text-critical">✕</button>
          </div>
        ))}
        {sorted.length === 0 && <p className="py-2 text-center text-sm text-soft">No hearings yet</p>}
      </div>

      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap gap-2">
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          <select className={input} value={purpose} onChange={(e) => setPurpose(e.target.value as HearingRecord["purpose"])}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input className={`${input} flex-1`} value={court} onChange={(e) => setCourt(e.target.value)} placeholder="Court (optional)" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink-dim">
            <input type="checkbox" checked={superior} onChange={(e) => setSuperior(e.target.checked)} /> Superior court (SC/HC)
          </label>
          {(superior || purpose === "slp" || purpose === "writ") && (
            <select className={input} value={forum} onChange={(e) => setForum(e.target.value as "SC" | "HC")}>
              <option value="SC">Supreme Court</option>
              <option value="HC">High Court</option>
            </select>
          )}
          <button onClick={add} disabled={!date || busy} className={`${btn("primary")} ml-auto disabled:opacity-40`}>
            Add hearing
          </button>
        </div>
      </div>
    </Section>
  );
}
