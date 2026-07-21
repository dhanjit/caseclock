/**
 * First-run demo banner (see state/onboarding.ts). Shown while demo sample cases
 * are loaded, so a new officer knows the data isn't real and can start fresh.
 * Two-step inline confirm — no native dialogs (design-direction §4).
 */
import { useState } from "react";
import { btn } from "@/features/components/TopBar";

export function DemoBanner({ onClear }: { onClear: () => void }) {
  const [arming, setArming] = useState(false);
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink">
        <span className="font-semibold">👋 Demo mode</span>
        <span className="text-ink-dim">
          {" "}
          — these are sample cases so you can explore. Tap any case to see its statutory clocks. When
          you’re ready, clear them and start with your own.
        </span>
      </p>
      {arming ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold text-critical">Clear the demo cases? Can’t be undone.</span>
          <button className={`${btn("primary")} !bg-critical`} onClick={onClear}>
            Clear
          </button>
          <button className={btn("ghost")} onClick={() => setArming(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button className={`${btn("primary")} shrink-0`} onClick={() => setArming(true)}>
          Clear & start fresh
        </button>
      )}
    </div>
  );
}
