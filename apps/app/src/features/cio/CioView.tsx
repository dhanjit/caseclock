/**
 * CIO master list (V7-6) — "List of CIO": Case Investigating Officers used by every
 * case's H5.1 dropdown. Reference data (deletable, re-orderable), app-level.
 */
import { useState } from "react";
import { useCio } from "@/state/cio";
import { useCases } from "@/state/cases";

export function CioView() {
  const officers = useCio((s) => s.officers);
  const add = useCio((s) => s.add);
  const update = useCio((s) => s.update);
  const remove = useCio((s) => s.remove);
  const move = useCio((s) => s.move);
  const aggregates = useCases((s) => s.aggregates);
  const [name, setName] = useState("");
  const [rank, setRank] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRank, setEditRank] = useState("");

  const caseCount = (id: string) => aggregates.filter((a) => a.case.cioId === id).length;

  const submit = () => {
    if (!name.trim()) return;
    void add(name, rank);
    setName("");
    setRank("");
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-1 flex items-baseline gap-3 border-b-2 border-statutory pb-2">
        <h1 className="text-xl font-semibold">List of CIO</h1>
        <span className="eyebrow">Case Investigating Officers · master list · used across all cases</span>
      </div>
      <p className="mb-4 mt-2 text-sm text-ink-dim">
        Officers added here appear in the “Name of CIO” dropdown (heading 5.1) on every case file.
      </p>

      <div className="overflow-hidden rounded border border-line bg-surface-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-left font-mono text-[10.5px] uppercase tracking-wider text-surface">
              <th className="w-10 px-3 py-2">Sl.</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Rank of officer</th>
              <th className="w-20 px-3 py-2 text-center">Cases</th>
              <th className="w-36 px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {officers.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-ink-dim" colSpan={5}>
                  No officers added yet — add the first one below.
                </td>
              </tr>
            )}
            {officers.map((o, i) => (
              <tr key={o.id} className="border-t border-surface-3 align-top">
                <td className="px-3 py-2 font-mono font-semibold">{i + 1}</td>
                {editId === o.id ? (
                  <>
                    <td className="px-3 py-1.5">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded border border-statutory bg-surface-2 px-2 py-1.5"
                        aria-label="Officer name"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={editRank}
                        onChange={(e) => setEditRank(e.target.value)}
                        className="w-full rounded border border-line bg-surface-2 px-2 py-1.5"
                        aria-label="Officer rank"
                      />
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{caseCount(o.id)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => {
                          void update(o.id, { name: editName.trim() || o.name, rank: editRank.trim() || undefined });
                          setEditId(null);
                        }}
                        className="rounded bg-ink px-3 py-1.5 font-mono text-xs text-surface"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditId(null)} className="ml-1 rounded border border-line px-2.5 py-1.5 font-mono text-xs">
                        ✕
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{o.name}</td>
                    <td className="px-3 py-2 text-ink-dim">{o.rank || "—"}</td>
                    <td className="px-3 py-2 text-center font-mono">{caseCount(o.id)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex gap-1">
                        <button
                          onClick={() => void move(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${o.name} up`}
                          className="rounded border border-line px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => void move(i, 1)}
                          disabled={i === officers.length - 1}
                          aria-label={`Move ${o.name} down`}
                          className="rounded border border-line px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => {
                            setEditId(o.id);
                            setEditName(o.name);
                            setEditRank(o.rank ?? "");
                          }}
                          className="rounded border border-line px-2 py-1 font-mono text-xs text-court"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => void remove(o.id)}
                          disabled={caseCount(o.id) > 0}
                          title={caseCount(o.id) > 0 ? "In use by a case — reassign first" : "Remove officer"}
                          aria-label={`Remove ${o.name}`}
                          className="rounded border border-line px-2 py-1 text-xs text-critical disabled:opacity-30"
                        >
                          ✕
                        </button>
                      </span>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-3 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Officer name"
            className="min-w-40 flex-1 rounded border border-line bg-surface-2 px-3 py-2"
          />
          <input
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Rank of officer"
            className="min-w-32 flex-1 rounded border border-line bg-surface-2 px-3 py-2"
          />
          <button onClick={submit} className="rounded bg-ink px-4 py-2 font-mono text-sm text-surface">
            + Add officer
          </button>
        </div>
      </div>
      <p className="eyebrow mt-3">Reference data — deletable (unlike case records), ▲▼ to re-rank; officers in use by a case cannot be removed.</p>
    </div>
  );
}
