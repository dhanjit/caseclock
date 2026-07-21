/**
 * Per-case image gallery (REQUIREMENTS §10). Pick photos → downscaled to a thumb
 * (in-vault) + a bounded full image (encrypted sidecar) → tagged to an accused /
 * place / evidence / document. Tap a tile for the full-resolution lightbox. Fully
 * offline. Mind-map nodes reuse the same thumbnails (state/attachments).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import {
  ATTACHMENT_KIND_LABEL,
  type AttachmentKind,
  type AttachmentThumb,
  type NewAttachment,
} from "@/domain/attachment";
import { processImage } from "@/domain/image";
import { useAttachments } from "@/state/attachments";
import { Section, Field } from "@/features/components/bits";
import { btn } from "@/features/components/TopBar";

const input = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

const KIND_BADGE: Record<AttachmentKind, string> = {
  accused: "border-court/40 bg-court/15 text-court",
  place: "border-statutory/40 bg-statutory/15 text-statutory",
  evidence: "border-violet-500/40 bg-violet-100 text-violet-900",
  doc: "border-slate-500/40 bg-slate-200 text-slate-700",
  other: "border-line bg-surface-3 text-ink-dim",
};

const KINDS: AttachmentKind[] = ["evidence", "accused", "place", "doc", "other"];

function blobUrl(bytes: Uint8Array, mime: string): string {
  // Copy into a fresh ArrayBuffer-backed view so the Blob owns its bytes.
  return URL.createObjectURL(new Blob([bytes.slice()], { type: mime }));
}

export function GalleryPanel({ agg }: { agg: CaseAggregate }) {
  const caseId = agg.case.id;
  const list = useAttachments((s) => s.byCase[caseId]) ?? [];
  const loadCase = useAttachments((s) => s.loadCase);
  const addImages = useAttachments((s) => s.addImages);
  const remove = useAttachments((s) => s.remove);
  const retag = useAttachments((s) => s.retag);
  const getOriginal = useAttachments((s) => s.getOriginal);

  const accused = useMemo(() => agg.persons.filter((p) => p.role === "accused"), [agg.persons]);
  const evidence = agg.evidence ?? [];

  const [newKind, setNewKind] = useState<AttachmentKind>("evidence");
  const [newRefId, setNewRefId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadCase(caseId);
  }, [caseId, loadCase]);

  // Object URLs for the grid thumbnails — rebuilt when the list changes, revoked on cleanup.
  const thumbUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of list) map.set(a.id, blobUrl(a.thumb, a.mime));
    return map;
  }, [list]);
  useEffect(() => () => thumbUrls.forEach((u) => URL.revokeObjectURL(u)), [thumbUrls]);

  // Revoke the lightbox URL when it closes / changes.
  useEffect(() => () => { if (lightbox) URL.revokeObjectURL(lightbox.url); }, [lightbox]);

  const refOptions = newKind === "accused" ? accused.map((p) => ({ id: p.id, label: p.name }))
    : newKind === "evidence" ? evidence.map((e) => ({ id: e.id, label: e.description || e.reportToObtain || "exhibit" }))
    : [];

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const items: NewAttachment[] = [];
      for (const f of files) {
        const img = await processImage(f);
        items.push({
          caseId,
          kind: newKind,
          refId: refOptions.length ? (newRefId || null) : null,
          mime: img.mime,
          caption: f.name.replace(/\.[^.]+$/, "").slice(0, 80),
          thumb: img.thumb,
          original: img.full,
        });
      }
      await addImages(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openLightbox(a: AttachmentThumb) {
    try {
      const bytes = await getOriginal(a.blobRef);
      if (!bytes) {
        setError("The full-resolution original isn't on this device (sidecar files aren't in the backup).");
        return;
      }
      const url = blobUrl(bytes, a.mime);
      // Revoke any prior lightbox URL when replacing it (guards a rapid double-open).
      setLightbox((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, caption: a.caption ?? "" };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function refLabel(a: AttachmentThumb): string | null {
    if (a.kind === "accused") return accused.find((p) => p.id === a.refId)?.name ?? null;
    if (a.kind === "evidence") {
      const e = evidence.find((x) => x.id === a.refId);
      return e ? e.description || e.reportToObtain || "exhibit" : null;
    }
    return null;
  }

  return (
    <Section title="Gallery & photos" hint={`${list.length} image${list.length === 1 ? "" : "s"}`} className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Tag new photos as">
          <select
            className={input}
            value={newKind}
            onChange={(e) => {
              setNewKind(e.target.value as AttachmentKind);
              setNewRefId("");
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{ATTACHMENT_KIND_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        {refOptions.length > 0 && (
          <Field label={newKind === "accused" ? "Which accused" : "Which exhibit"}>
            <select className={input} value={newRefId} onChange={(e) => setNewRefId(e.target.value)}>
              <option value="">— unlinked —</option>
              {refOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
        )}
        <button onClick={() => fileRef.current?.click()} disabled={busy} className={`${btn("primary")} disabled:opacity-40`}>
          {busy ? "Processing…" : "Add photos"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      </div>
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}

      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-soft">No photos yet — accused mugshots, place of occurrence, exhibit images.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {list.map((a) => (
            <figure key={a.id} className="overflow-hidden rounded-xl border border-line bg-surface-2">
              <button onClick={() => void openLightbox(a)} className="block aspect-square w-full">
                <img src={thumbUrls.get(a.id)} alt={a.caption ?? ""} className="h-full w-full object-cover" />
              </button>
              <figcaption className="space-y-1 p-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className={`rounded border px-1 py-0.5 text-[9px] font-medium ${KIND_BADGE[a.kind]}`}>
                    {ATTACHMENT_KIND_LABEL[a.kind]}
                  </span>
                  <button onClick={() => void remove(caseId, a.id)} title="Delete" className="text-[11px] text-soft hover:text-critical">✕</button>
                </div>
                {refLabel(a) && <p className="truncate text-[10px] text-ink-dim">{refLabel(a)}</p>}
                <select
                  className="w-full rounded border border-line bg-surface-3 px-1 py-0.5 text-[10px] text-ink-dim"
                  value={a.kind}
                  onChange={(e) => void retag(caseId, a.id, { kind: e.target.value as AttachmentKind, refId: null })}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{ATTACHMENT_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox.url} alt={lightbox.caption} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          {lightbox.caption && <p className="mt-2 text-sm text-white/80">{lightbox.caption}</p>}
          <button className={`${btn("ghost")} mt-3`} onClick={() => setLightbox(null)}>Close</button>
        </div>
      )}
    </Section>
  );
}
