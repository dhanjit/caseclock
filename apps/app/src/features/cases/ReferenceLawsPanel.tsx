/** Reference Laws (REQUIREMENTS §5) — preloaded, read-only, with citations/links. */

import { useState } from "react";
import { REFERENCE_LAWS } from "@/domain/reference-laws";
import { Section } from "@/features/components/bits";

export function ReferenceLawsPanel() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Section title="Reference laws" hint="read-only · verify the bare Act" className="mt-3">
      <div className="space-y-1.5">
        {REFERENCE_LAWS.map((law, i) => (
          <div key={law.title} className="rounded-xl bg-surface-3/40">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{law.title}</span>
                <span className="block truncate text-xs text-soft">{law.citation}</span>
              </span>
              <span className="shrink-0 text-soft">{open === i ? "▾" : "▸"}</span>
            </button>
            {open === i && (
              <div className="space-y-2 px-3 pb-3">
                {law.provisions.map((p) => (
                  <div key={p.label}>
                    <p className="text-xs font-medium text-court">{p.label}</p>
                    <p className="text-xs text-ink-dim">{p.text}</p>
                  </div>
                ))}
                <a href={law.source} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-court underline">
                  Official source (India Code) ↗
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-soft">
        Convenience reference only — not legal advice. The bare Act on India Code is authoritative.
      </p>
    </Section>
  );
}
