/**
 * Ephemeral UI preferences (not case data) — persisted to localStorage so a
 * collapsed sidebar stays collapsed across unlocks. Safe to store in the clear:
 * it holds no case content, just layout chrome.
 */
import { create } from "zustand";

const KEY = "cc_sidebar_collapsed";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  sidebarCollapsed: read(),
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* private mode / unavailable — in-memory only */
    }
    set({ sidebarCollapsed: next });
  },
}));
