import { create } from "zustand";

export type View =
  | { kind: "dashboard" }
  | { kind: "new" }
  | { kind: "case"; id: string }
  | { kind: "mindmap"; id: string }
  | { kind: "search"; q?: string }
  | { kind: "review" }
  | { kind: "cio" }
  | { kind: "links" }
  | { kind: "settings" };

interface NavState {
  view: View;
  go: (view: View) => void;
}

export const useNav = create<NavState>((set) => ({
  view: { kind: "dashboard" },
  go: (view) => set({ view }),
}));
