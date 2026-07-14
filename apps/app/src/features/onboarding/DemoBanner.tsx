/**
 * First-run demo banner (see state/onboarding.ts). Shown while demo sample cases
 * are loaded, so a new officer knows the data isn't real and can start fresh.
 */
import { btn } from "@/features/components/TopBar";

export function DemoBanner({ onClear }: { onClear: () => void }) {
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
      <button
        className={`${btn("primary")} shrink-0`}
        onClick={() => {
          if (window.confirm("Clear the demo cases and start fresh? This can’t be undone.")) onClear();
        }}
      >
        Clear & start fresh
      </button>
    </div>
  );
}
