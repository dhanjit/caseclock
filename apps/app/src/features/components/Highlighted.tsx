/**
 * Renders text with any watchlist name (banned org / terrorist, §5) auto-marked
 * RED. Used across the case file so a fed name lights up wherever it appears.
 */

import { useWatchlist } from "@/state/watchlist";

export function Highlighted({ text }: { text?: string | null }) {
  const names = useWatchlist((s) => s.names);
  if (!text) return <>{text ?? ""}</>;
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  // Longest-first so "Khanna" wins over "Khan"; word boundaries so a short token
  // ("IS") doesn't paint mid-word ("PARIS").
  const escaped = [...trimmed]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return <>{text}</>;
  const re = new RegExp(`(?<![A-Za-z0-9])(${escaped.join("|")})(?![A-Za-z0-9])`, "gi");
  const lower = new Set(trimmed.map((n) => n.toLowerCase()));
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        lower.has(p.toLowerCase()) ? (
          <mark key={i} className="rounded bg-critical/25 px-0.5 font-medium text-critical">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
