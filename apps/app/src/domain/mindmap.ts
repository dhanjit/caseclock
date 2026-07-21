/**
 * Per-case mind map (REQUIREMENTS §10) — a PURE radial layout. Central node = case
 * number + identity; 13 fixed first-level branches mirror the 13 case-file headings;
 * accused / court / evidence branches fan out leaf nodes coloured by status. Nodes
 * carrying a thumbnail ref are looked up against the attachment store by the view.
 *
 * No graph library: deterministic trig placement on a 1400×1400 canvas, so it's
 * unit-testable and renders as plain SVG (PWA / iPad-friendly).
 */

import type { CaseAggregate } from "@/domain/repository";
import type { AccusedStatus } from "@/domain/types";
import { accusedStatusMeta } from "@/domain/accused";
import type { AttachmentKind } from "@/domain/attachment";

const CRITICAL = "#f4496d";
const COURT = "#3b82f6";
const STATUTORY = "#f5a524";
const SOFT = "#64748b";
const OK = "#22c55e";
const INK = "#243049";

/** Accused status → SVG fill (mirrors the badge tones in domain/accused.ts). */
const STATUS_HEX: Record<AccusedStatus, string> = {
  police_custody: "#fbbf24",
  judicial_custody: "#60a5fa",
  not_arrested: "#94a3b8",
  absconding: "#ef4444",
  killed: "#a1a1aa",
  surrendered: "#2dd4bf",
  approver: "#a78bfa",
  charge_sheeted: "#4ade80",
  under_investigation: "#facc15",
  acquitted: "#38bdf8",
  convicted: "#fb7185",
  dropped: "#a8a29e",
};

export interface MindNode {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  sublabel?: string;
  fill: string;
  kind: "root" | "branch" | "leaf";
  /** RED alert ring — banned-org / watchlisted name (§5/§10). */
  alert?: boolean;
  /** Thumbnail lookup (matched against the case's attachments). */
  thumbKind?: AttachmentKind;
  thumbRefId?: string | null;
}

export interface MindEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alert?: boolean;
}

export interface MindMap {
  nodes: MindNode[];
  edges: MindEdge[];
  viewW: number;
  viewH: number;
}

const VIEW = 1400;
const CX = VIEW / 2;
const CY = VIEW / 2;
const R_BRANCH = 270;
const R_LEAF = 480;
const DEG = Math.PI / 180;

function short(s: string | null | undefined, n = 22): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function isWatchlisted(name: string, watch: string[]): boolean {
  const n = name.toLowerCase();
  return watch.some((w) => w && n.includes(w.toLowerCase()));
}

export function buildMindMap(agg: CaseAggregate, watchlistNames: string[] = []): MindMap {
  const c = agg.case;
  const accused = agg.persons.filter((p) => p.role === "accused");
  const hearings = agg.hearings;
  const evidence = agg.evidence ?? [];

  const nodes: MindNode[] = [];
  const edges: MindEdge[] = [];

  nodes.push({
    id: "root",
    x: CX,
    y: CY,
    r: 76,
    label: c.firNumber,
    sublabel: short(c.identity, 36),
    fill: "#1a2540",
    kind: "root",
  });

  // 13 branches mirroring the case-file headings, with derived leaves on 9/11/12.
  const branches: { title: string; sublabel?: string; leaves?: MindNode[] }[] = [
    { title: "Case number", sublabel: short(c.firNumber) },
    { title: "Identity", sublabel: short(c.identity, 28) },
    { title: "Sections of law", sublabel: short(c.sectionsOfLaw, 28) },
    { title: "Date of occurrence", sublabel: c.occurrenceDate ?? "—" },
    { title: "Date of registration", sublabel: c.firDate },
    { title: "Brief", sublabel: short(c.brief, 28) },
    { title: "No. of accused", sublabel: String(accused.length) },
    { title: "Progress", sublabel: short(c.investigationProgress, 28) },
    {
      title: "Evidences",
      sublabel: `${evidence.length} item(s)`,
      leaves: evidence.map((e, i) => ({
        id: `ev-${e.id ?? i}`,
        x: 0,
        y: 0,
        r: 30,
        label: short(e.description || e.reportToObtain || "exhibit", 18) ?? "exhibit",
        sublabel: e.status === "received" ? "received" : "pending",
        fill: e.status === "received" ? OK : STATUTORY,
        kind: "leaf" as const,
        thumbKind: "evidence" as const,
        thumbRefId: e.id,
      })),
    },
    { title: "Status of trial", sublabel: short(c.trialStatus, 28) },
    {
      title: "Court matters",
      sublabel: `${hearings.length} hearing(s)`,
      leaves: hearings.map((h, i) => ({
        id: `h-${h.id ?? i}`,
        x: 0,
        y: 0,
        r: 30,
        label: h.purpose,
        sublabel: h.hearingDate,
        fill: h.tier === "superior" ? CRITICAL : COURT,
        kind: "leaf" as const,
      })),
    },
    {
      title: "Accused",
      sublabel: `${accused.length}`,
      leaves: accused.map((p, i) => {
        const flagged = isWatchlisted(p.name, watchlistNames);
        return {
          id: `a-${p.id ?? i}`,
          x: 0,
          y: 0,
          r: 34,
          label: short(p.name, 16) ?? "accused",
          sublabel: p.accusedStatus ? accusedStatusMeta(p.accusedStatus).label : undefined,
          fill: flagged ? CRITICAL : p.accusedStatus ? STATUS_HEX[p.accusedStatus] ?? SOFT : SOFT,
          kind: "leaf" as const,
          alert: flagged,
          thumbKind: "accused" as const,
          thumbRefId: p.id,
        };
      }),
    },
    { title: "Plan of action", sublabel: short(c.planOfAction, 28) },
  ];

  const n = branches.length;
  branches.forEach((b, i) => {
    const angle = (-90 + (i * 360) / n) * DEG;
    const bx = CX + R_BRANCH * Math.cos(angle);
    const by = CY + R_BRANCH * Math.sin(angle);
    const branchId = `b-${i}`;
    edges.push({ x1: CX, y1: CY, x2: bx, y2: by });
    nodes.push({
      id: branchId,
      x: bx,
      y: by,
      r: 48,
      label: b.title,
      sublabel: b.sublabel,
      fill: "#121a2e",
      kind: "branch",
    });

    const leaves = b.leaves ?? [];
    if (leaves.length === 0) return;
    // Fan leaves within this branch's angular slice (kept narrow to avoid overlap).
    const spread = Math.min(9, leaves.length > 1 ? 24 / (leaves.length - 1) : 0) * DEG;
    const start = angle - (spread * (leaves.length - 1)) / 2;
    leaves.forEach((leaf, j) => {
      const la = start + spread * j;
      const lx = CX + R_LEAF * Math.cos(la);
      const ly = CY + R_LEAF * Math.sin(la);
      edges.push({ x1: bx, y1: by, x2: lx, y2: ly, alert: leaf.alert });
      nodes.push({ ...leaf, x: lx, y: ly });
    });
  });

  return { nodes, edges, viewW: VIEW, viewH: VIEW };
}

export const MIND_COLORS = { CRITICAL, COURT, STATUTORY, SOFT, OK, INK };
