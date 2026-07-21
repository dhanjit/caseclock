/**
 * PW — prosecution witnesses (T3 / V6 preview): Sl.-numbered roster with the
 * relevance ("what this witness proves") column, an examined toggle feeding
 * trial readiness, and ▲▼ re-ranking. Edit-only — witnesses are re-ranked or
 * corrected, never deleted.
 */
import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { PersonRecord } from "@/domain/types";
import { newId } from "@/lib/id";
import { Section } from "@/features/components/bits";
import { DeferredInput } from "@/features/components/DeferredInput";
import { Highlighted } from "@/features/components/Highlighted";
import { btn } from "@/features/components/TopBar";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function WitnessPanel({
  agg,
  onSavePersons,
}: {
  agg: CaseAggregate;
  onSavePersons: (persons: PersonRecord[] | ((prev: PersonRecord[]) => PersonRecord[])) => Promise<void>;
}) {
  const witnesses = agg.persons.filter((p) => p.role === "witness");
  const examined = witnesses.filter((w) => w.examined).length;
  const [name, setName] = useState("");
  const [relevance, setRelevance] = useState("");

  // Updater-form commits over the witness subset, preserving everyone else.
  const commit = (fn: (ws: PersonRecord[]) => PersonRecord[]) =>
    onSavePersons((prev) => {
      const rest = prev.filter((p) => p.role !== "witness");
      return [...rest, ...fn(prev.filter((p) => p.role === "witness"))];
    });

  async function add() {
    if (!name.trim()) return;
    const w: PersonRecord = {
      id: newId("pw"),
      caseId: agg.case.id,
      role: "witness",
      name: name.trim(),
      relevance: relevance.trim() || undefined,
      examined: false,
    };
    await commit((ws) => [...ws, w]);
    setName("");
    setRelevance("");
  }
  const patchRow = (id: string, patch: Partial<PersonRecord>) =>
    commit((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const move = (i: number, dir: -1 | 1) =>
    commit((ws) => {
      const j = i + dir;
      if (j < 0 || j >= ws.length) return ws;
      const next = [...ws];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Section
      title="Prosecution witnesses (PW)"
      hint={`${witnesses.length} · ${examined} examined · ${witnesses.length - examined} pending · edit-only`}
      className="mt-3"
    >
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-ink text-left font-mono text-[9.5px] uppercase tracking-wider text-surface">
              <th className="w-8 px-2.5 py-1.5">Sl.</th>
              <th className="px-2.5 py-1.5">Witness</th>
              <th className="px-2.5 py-1.5">Relevance — what it proves</th>
              <th className="w-20 px-2.5 py-1.5 text-center">Examined</th>
              <th className="w-16 px-2.5 py-1.5 text-center">Rank</th>
            </tr>
          </thead>
          <tbody>
            {witnesses.length === 0 && (
              <tr><td colSpan={5} className="px-2.5 py-2 italic text-ink-dim">No witnesses listed yet.</td></tr>
            )}
            {witnesses.map((w, i) => (
              <tr key={w.id} className="border-t border-surface-3 align-top">
                <td className="px-2.5 py-1.5 text-center font-mono font-bold">{i + 1}</td>
                <td className="px-2.5 py-1.5">
                  <DeferredInput
                    className={`${input} w-full py-1 text-[12.5px]`}
                    value={w.name}
                    onCommit={(v) => v.trim() && void patchRow(w.id, { name: v.trim() })}
                    aria-label={`Witness ${i + 1} name`}
                  />
                  <span className="sr-only"><Highlighted text={w.name} /></span>
                </td>
                <td className="px-2.5 py-1.5">
                  <DeferredInput
                    className={`${input} w-full py-1 text-[12.5px]`}
                    value={w.relevance ?? ""}
                    onCommit={(v) => void patchRow(w.id, { relevance: v.trim() || undefined })}
                    placeholder="what this witness proves"
                    aria-label={`Witness ${i + 1} relevance`}
                  />
                </td>
                <td className="px-2.5 py-1.5 text-center">
                  <button
                    onClick={() => void patchRow(w.id, { examined: !w.examined })}
                    className={`rounded px-2.5 py-1 text-[11px] font-semibold ${w.examined ? "bg-green-bg text-ok" : "bg-surface-3 text-ink-dim"}`}
                    aria-label={`Toggle examined for ${w.name}`}
                  >
                    {w.examined ? "Yes" : "No"}
                  </button>
                </td>
                <td className="px-2.5 py-1.5 text-center">
                  <span className="inline-flex gap-1">
                    <button onClick={() => void move(i, -1)} disabled={i === 0} className="rounded border border-line px-2 py-1 text-xs disabled:opacity-30" aria-label={`Move ${w.name} up`}>▲</button>
                    <button onClick={() => void move(i, 1)} disabled={i === witnesses.length - 1} className="rounded border border-line px-2 py-1 text-xs disabled:opacity-30" aria-label={`Move ${w.name} down`}>▼</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input className={`${input} min-w-36 flex-1 py-1.5 text-xs`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Witness name" />
        <input className={`${input} min-w-48 flex-[2] py-1.5 text-xs`} value={relevance} onChange={(e) => setRelevance(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder="Relevance — what this witness proves" />
        <button onClick={() => void add()} disabled={!name.trim()} className={`${btn("primary")} disabled:opacity-40`}>+ Add PW</button>
      </div>
      <p className="eyebrow mt-2">▲▼ to re-rank — the Sl. no. follows the order. Tap Examined to toggle.</p>
    </Section>
  );
}
