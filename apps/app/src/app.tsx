/**
 * CaseClock app root.
 *  - ?spike=1 → the M0.5 storage spike.
 *  - otherwise gate on the vault: lock screen until unlocked, then the cockpit.
 */

import { useEffect } from "react";
import { SpikePanel } from "@/features/spike/SpikePanel";
import { LockScreen } from "@/features/lock/LockScreen";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { CaseWizard } from "@/features/cases/CaseWizard";
import { CaseDetail } from "@/features/cases/CaseDetail";
import { SearchView } from "@/features/search/SearchView";
import { ReviewView } from "@/features/review/ReviewView";
import { SettingsView } from "@/features/settings/SettingsView";
import { useSession } from "@/state/session";
import { useNav } from "@/state/nav";
import { useCases } from "@/state/cases";
import { useWatchlist } from "@/state/watchlist";
import { useAutoLock } from "@/features/lock/useAutoLock";

function Shell() {
  useAutoLock();
  const view = useNav((s) => s.view);
  switch (view.kind) {
    case "new":
      return <CaseWizard />;
    case "case":
      return <CaseDetail id={view.id} />;
    case "search":
      return <SearchView />;
    case "review":
      return <ReviewView />;
    case "settings":
      return <SettingsView />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  const status = useSession((s) => s.status);
  const init = useSession((s) => s.init);

  const isSpike = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("spike");

  useEffect(() => {
    if (!isSpike) void init();
  }, [init, isSpike]);

  // Load cases + the watchlist whenever the vault becomes unlocked (PLAN §6.5 / M4).
  useEffect(() => {
    if (status === "unlocked") {
      void useCases.getState().load();
      void useWatchlist.getState().load();
    }
  }, [status]);

  if (isSpike) return <SpikePanel />;
  if (status !== "unlocked") return <LockScreen />;
  return <Shell />;
}
