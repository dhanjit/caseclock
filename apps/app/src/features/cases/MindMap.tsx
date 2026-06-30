/**
 * Per-case mind map view (REQUIREMENTS §10). Renders the pure buildMindMap layout
 * as pan/zoomable SVG: central case node, 13 heading branches, accused/court/
 * evidence leaves coloured by status, banned-org nodes RED, with attachment
 * thumbnails on the accused/evidence nodes. Touch-friendly (drag to pan, ± to zoom).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { useWatchlist } from "@/state/watchlist";
import { useAttachments } from "@/state/attachments";
import { buildMindMap, type MindNode } from "@/domain/mindmap";
import { TopBar, btn } from "@/features/components/TopBar";

function thumbKey(kind: string, refId: string | null | undefined): string {
  return `${kind}:${refId ?? ""}`;
}

export function MindMap({ id }: { id: string }) {
  const agg = useCases((s) => s.getById(id));
  const go = useNav((s) => s.go);
  const watch = useWatchlist((s) => s.names);
  const attachments = useAttachments((s) => s.byCase[id]) ?? [];
  const loadCase = useAttachments((s) => s.loadCase);

  useEffect(() => {
    void loadCase(id);
  }, [id, loadCase]);

  const map = useMemo(() => (agg ? buildMindMap(agg, watch) : null), [agg, watch]);

  // One thumbnail per (kind, refId) → object URL, revoked on change/unmount.
  const thumbUrls = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of attachments) {
      const k = thumbKey(a.kind, a.refId);
      if (!m.has(k)) m.set(k, URL.createObjectURL(new Blob([a.thumb.slice()], { type: a.mime })));
    }
    return m;
  }, [attachments]);
  useEffect(() => () => thumbUrls.forEach((u) => URL.revokeObjectURL(u)), [thumbUrls]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.62);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  function pxToUser(dx: number, dy: number): { x: number; y: number } {
    const w = svgRef.current?.clientWidth || 800;
    const scale = (map?.viewW ?? 1400) / w; // viewBox units per client px
    return { x: dx * scale, y: dy * scale };
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const d = pxToUser(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + d.x, y: p.y + d.y }));
  }
  function onPointerUp() {
    drag.current = null;
  }
  const zoomBy = (f: number) => setZoom((z) => Math.min(3, Math.max(0.3, z * f)));
  const reset = () => {
    setPan({ x: 0, y: 0 });
    setZoom(0.62);
  };

  if (!agg || !map) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-5">
        <TopBar title="Mind map" actions={<button onClick={() => go({ kind: "dashboard" })} className={btn("ghost")}>Back</button>} />
        <p className="mt-6 text-center text-sm text-soft">Case not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5">
        <TopBar
          title="Mind map"
          subtitle={agg.case.firNumber}
          actions={
            <>
              <button onClick={() => zoomBy(1.25)} className={btn("icon")} aria-label="Zoom in">＋</button>
              <button onClick={() => zoomBy(0.8)} className={btn("icon")} aria-label="Zoom out">－</button>
              <button onClick={reset} className={btn("ghost")}>Reset</button>
              <button onClick={() => go({ kind: "case", id })} className={btn("ghost")}>Back</button>
            </>
          }
        />
      </div>
      <div className="mt-2 flex-1 overflow-hidden border-t border-line bg-surface">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${map.viewW} ${map.viewH}`}
          className="h-full w-full touch-none select-none"
          style={{ cursor: drag.current ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {map.edges.map((e, i) => (
              <line
                key={`e${i}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={e.alert ? "#f4496d" : "#243049"}
                strokeWidth={e.alert ? 3 : 2}
              />
            ))}
            {map.nodes.map((node) => (
              <MapNode key={node.id} node={node} thumbUrl={node.thumbRefId != null ? thumbUrls.get(thumbKey(node.thumbKind ?? "", node.thumbRefId)) : undefined} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

function MapNode({ node, thumbUrl }: { node: MindNode; thumbUrl?: string }) {
  const { x, y, r } = node;
  const labelFont = node.kind === "root" ? 22 : node.kind === "branch" ? 15 : 14;
  return (
    <g>
      {thumbUrl && (
        <>
          <clipPath id={`clip-${node.id}`}>
            <circle cx={x} cy={y} r={r - 2} />
          </clipPath>
          <image
            href={thumbUrl}
            x={x - r}
            y={y - r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#clip-${node.id})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      )}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={thumbUrl ? "none" : node.fill}
        stroke={node.alert ? "#f4496d" : "#344161"}
        strokeWidth={node.alert ? 4 : node.kind === "root" ? 3 : 2}
        fillOpacity={node.kind === "leaf" ? 0.92 : 1}
      />
      {/* In-node label for root/branch (centered); leaves label below. */}
      {node.kind !== "leaf" && (
        <text x={x} y={y + 4} textAnchor="middle" fontSize={labelFont} fontWeight={600} fill="#e5edff">
          {node.kind === "root" ? node.label : truncFit(node.label)}
        </text>
      )}
      {/* Sublabel / leaf labels below the circle. */}
      {node.kind === "leaf" ? (
        <>
          <text x={x} y={y + r + 18} textAnchor="middle" fontSize={14} fontWeight={600} fill="#e5edff">
            {node.label}
          </text>
          {node.sublabel && (
            <text x={x} y={y + r + 34} textAnchor="middle" fontSize={12} fill="#9aa7c7">
              {node.sublabel}
            </text>
          )}
        </>
      ) : (
        node.sublabel && (
          <text x={x} y={y + r + 20} textAnchor="middle" fontSize={13} fill="#9aa7c7">
            {node.sublabel}
          </text>
        )
      )}
    </g>
  );
}

/** Keep a branch title inside its circle (very rough fit). */
function truncFit(s: string): string {
  return s.length > 13 ? `${s.slice(0, 12)}…` : s;
}
