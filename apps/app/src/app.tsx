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
import { MindMap } from "@/features/cases/MindMap";
import { SearchView } from "@/features/search/SearchView";
import { ReviewView } from "@/features/review/ReviewView";
import { CioView } from "@/features/cio/CioView";
import { LinksView } from "@/features/links/LinksView";
import { CalendarView } from "@/features/calendar/CalendarView";
import { SettingsView } from "@/features/settings/SettingsView";
import { useSession } from "@/state/session";
import { useNav } from "@/state/nav";
import { useCases } from "@/state/cases";
import { useCio } from "@/state/cio";
import { useWatchlist } from "@/state/watchlist";
import { useNotifySettings } from "@/state/notify-settings";
import { useOnboarding } from "@/state/onboarding";
import { useAutoLock } from "@/features/lock/useAutoLock";
import { Sidebar } from "@/features/nav/Sidebar";

function Shell() {
  useAutoLock();
  const view = useNav((s) => s.view);
  switch (view.kind) {
    case "new":
      return <CaseWizard />;
    case "case":
      // key: switching cases MUST remount the detail tree — otherwise panel edit
      // buffers survive the switch and save case A's content into case B
      // (review finding, live-reproduced).
      return <CaseDetail key={view.id} id={view.id} />;
    case "mindmap":
      return <MindMap id={view.id} />;
    case "search":
      return <SearchView />;
    case "review":
      return <ReviewView />;
    case "cio":
      return <CioView />;
    case "links":
      return <LinksView />;
    case "calendar":
      return <CalendarView />;
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
      void (async () => {
        await useCases.getState().load();
        await useWatchlist.getState().load();
        await useCio.getState().load();
        void useNotifySettings.getState().load();
        // First run: seed the demo cases + show the banner (once, until cleared).
        await useOnboarding.getState().maybeStartDemo();
      })();
    }
  }, [status]);

  if (isSpike) return <SpikePanel />;
  if (status !== "unlocked") return <LockScreen />;
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto overscroll-none">
        <Shell />
      </main>
    </div>
  );
}
