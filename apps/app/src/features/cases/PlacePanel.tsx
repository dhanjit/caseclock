/**
 * Place of occurrence (REQUIREMENTS §5) — plotted on a map.
 * Local-first / no-leak: the inline map is OPT-IN (it fetches tiles from
 * OpenStreetMap, i.e. sends the coordinates off-device). External map links are
 * always available but user-initiated. Nothing phones home without an explicit click.
 */

import { useState } from "react";
import type { CaseAggregate } from "@/domain/repository";
import type { CaseRecord, PlaceOfOccurrence } from "@/domain/types";
import { Section } from "@/features/components/bits";

const input = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-court";

export function PlacePanel({
  agg,
  onSaveCase,
}: {
  agg: CaseAggregate;
  onSaveCase: (patch: Partial<CaseRecord>) => Promise<void>;
}) {
  const place = agg.case.place ?? {};
  const [showMap, setShowMap] = useState(false);
  const patch = (p: Partial<PlaceOfOccurrence>) => onSaveCase({ place: { ...place, ...p } });

  const lat = place.lat ?? null;
  const lng = place.lng ?? null;
  const hasCoords = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const d = 0.02;
  const bbox = hasCoords ? `${lng! - d},${lat! - d},${lng! + d},${lat! + d}` : "";

  return (
    <Section title="Place of occurrence" hint="map" className="mt-3">
      <div className="space-y-2">
        <input
          className={`${input} w-full`}
          value={place.label ?? ""}
          onChange={(e) => patch({ label: e.target.value || undefined })}
          placeholder="Location (village / PS / landmark)"
        />
        <div className="flex flex-wrap gap-2">
          <input
            className={`${input} w-32`}
            value={lat ?? ""}
            onChange={(e) => patch({ lat: e.target.value ? Number(e.target.value) : null })}
            inputMode="decimal"
            placeholder="latitude"
          />
          <input
            className={`${input} w-32`}
            value={lng ?? ""}
            onChange={(e) => patch({ lng: e.target.value ? Number(e.target.value) : null })}
            inputMode="decimal"
            placeholder="longitude"
          />
        </div>

        {hasCoords ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a className="text-court underline" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
              Open in Google Maps ↗
            </a>
            <a className="text-court underline" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">
              Open in OSM ↗
            </a>
            <label className="ml-auto flex items-center gap-1.5 text-ink-dim">
              <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} />
              Show inline map
            </label>
          </div>
        ) : (
          <p className="text-xs text-soft">Enter coordinates to enable map links.</p>
        )}

        {hasCoords && showMap && (
          <div className="overflow-hidden rounded-xl border border-line">
            <iframe
              title="Place of occurrence"
              className="h-56 w-full"
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`}
            />
            <p className="bg-surface-3/60 px-2 py-1 text-[11px] text-soft">
              ⚠ Tiles fetched from openstreetmap.org — coordinates leave this device while the map is shown.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
