import { describe, it, expect } from "vitest";
import { buildMindMap } from "./mindmap";
import { sampleAggregates, SAMPLE_WATCHLIST } from "./seed";

const cases = sampleAggregates();
const c1 = cases[0]; // NIA 04/2024 — proscribed-outfit case (ULFA-I)

describe("buildMindMap (§10)", () => {
  it("has a root node = case number + identity and exactly 13 branches", () => {
    const m = buildMindMap(c1);
    const root = m.nodes.find((n) => n.kind === "root");
    expect(root?.label).toBe(c1.case.firNumber);
    expect(m.nodes.filter((n) => n.kind === "branch")).toHaveLength(13);
  });

  it("emits a leaf per accused, per hearing, and per evidence", () => {
    const m = buildMindMap(c1);
    const accused = c1.persons.filter((p) => p.role === "accused").length;
    const hearings = c1.hearings.length;
    const evidence = (c1.evidence ?? []).length;
    const leaves = m.nodes.filter((n) => n.kind === "leaf");
    expect(leaves.length).toBe(accused + hearings + evidence);
  });

  it("connects every branch to the root and every leaf to a branch", () => {
    const m = buildMindMap(c1);
    // 13 root→branch edges + one edge per leaf.
    const leaves = m.nodes.filter((n) => n.kind === "leaf").length;
    expect(m.edges.length).toBe(13 + leaves);
  });

  it("flags a watchlisted accused RED (alert) — banned-org node", () => {
    // Inject a watchlisted name onto an accused so the §10 RED rule fires.
    const tampered = {
      ...c1,
      persons: c1.persons.map((p, i) => (i === 0 && p.role === "accused" ? { ...p, name: "ULFA-I cadre" } : p)),
    };
    const m = buildMindMap(tampered, SAMPLE_WATCHLIST);
    const red = m.nodes.filter((n) => n.kind === "leaf" && n.alert);
    expect(red.length).toBeGreaterThan(0);
    expect(red[0].fill).toBe("#f4496d");
  });

  it("tags accused/evidence leaves with a thumbnail ref for attachment lookup", () => {
    const m = buildMindMap(c1);
    const accusedLeaf = m.nodes.find((n) => n.thumbKind === "accused");
    const evidenceLeaf = m.nodes.find((n) => n.thumbKind === "evidence");
    expect(accusedLeaf?.thumbRefId).toBeTruthy();
    expect(evidenceLeaf?.thumbRefId).toBeTruthy();
  });

  it("is deterministic and keeps nodes within the canvas", () => {
    const a = buildMindMap(c1);
    const b = buildMindMap(c1);
    expect(a).toEqual(b);
    for (const n of a.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(a.viewW);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(a.viewH);
    }
  });
});
