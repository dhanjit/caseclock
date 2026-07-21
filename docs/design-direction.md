# Design direction — Taposh's envisioned look, feel & flow (done better)

> Companion to [REQUIREMENTS-V4-DELTA.md](REQUIREMENTS-V4-DELTA.md). The delta
> says *what* CaseClock gains; this says *how it should look and flow*. Directive
> (2026-07-21): make CaseClock match how Taposh envisions the tool — his two
> previews **are** the vision — while beating them on UI quality, touch flow,
> and polish. Source of the visual language:
> [`spec/CaseTrack-preview-v7.html`](spec/CaseTrack-preview-v7.html).

## 1. His visual language — adopt as CaseClock's design system

A **case-diary / legal-ledger** aesthetic: cream paper, navy chrome, brass
accents, serif body with monospace numerals. It reads like a government file,
which is exactly the affinity the officer responds to. Adopt wholesale as
design tokens:

| Token | Value | Use |
|---|---|---|
| `ink` | `#15233b` | app chrome (header/nav), table heads, primary text |
| `ink2` | `#26384f` | secondary text |
| `paper` | `#f4efe4` | app background |
| `paper2` | `#ece4d3` | inset panels, add-rows, muted chips |
| `white` | `#fffdf8` | cards |
| `line` | `#cdbfa3` | hairline borders, dormant heat |
| `brass` | `#8a5e16` (+ `brassbg #f1e4c4`) | accents, priority ★, warn ≤15d, active nav |
| `red` | `#a3242b` (+ `redbg #f3dcdc`) | overdue/today, SC-HC, banned-org, seal-broken |
| `blue` | `#1f4e79` (+ `bluebg #d9e6f2`) | ok/clear, info banners, links |
| `green` | `#27623b` (+ `greenbg #d8e7d6`) | received/filed/obtained |
| `mute` | `#6b6256` | placeholders, eyebrows |

Type pairing: **serif body** `'Iowan Old Style','Palatino Linotype',Georgia,serif`
(Iowan Old Style ships on iPadOS — native fit) + **mono for data**
(`Menlo/SFMono/Consolas`) on case numbers, dates, pills, eyebrows. Signature
details to keep: uppercase letter-spaced **eyebrow labels**; numbered **heading
chips** (1, 1.1 … 13) in ink squares; **pills** for every status; 3–4px radii,
1px hairlines, flat surfaces (no heavy shadows); navy header with the round
brass **monogram**; brass-underlined section bars; severity grammar red/brass/
blue/line used *identically* everywhere (tiles, pills, calendar, engine rows).

## 2. His flow — adopt the information architecture

- **Locked → open**: monogram lock screen (create/unlock/restore) → workspace.
- **Top-level surfaces (7)**: Dashboard · Index · Case · Links · Calendar ·
  CIO · Reference (+ floating Backup control, + lock button).
- **Dashboard reading order** (his triage ritual, keep exactly): global search →
  macro stat tiles → Cat I–V strip → integrity checks ("silence is not safety")
  → priority ★ heat-tiles, then Monitored → pinned Superior Court Zone → the
  three reminder buckets (Court · Investigation follow-up · Expert-report
  pendency).
- **Case file = overview + focused sub-pages** (Progress, Plan, MO, Documents,
  PW, Custody, Court, Accused, Observations, Comms, Mind map): overview shows
  previews (latest 3 + "view all N"), sub-pages do the heavy editing.
- **Edit-in-place** on every heading; add-rows pinned under each table; one-tap
  state changes (recd / returned / dispose / mark filed / cycle sanction).

## 3. Where we do better — the "and better" list

**Interaction (the big one).** His preview leans on `prompt()`/`alert()`/
`confirm()` — replace every instance with proper UI: bottom sheets (iPad) /
dialogs (desktop) for dates + observations, toasts with **undo** for one-tap
state flips, inline validation. Destructive-ish actions (dispose, priority
demote) get undo instead of confirm.

**iPad-first layout.** He designed a single 1080px column for desktop. CaseClock
is iPad-first: persistent **left rail** in landscape (the 7 surfaces + Settings),
tab bar in portrait; case view as **master–detail** (case list ⇄ case file);
≥44pt touch targets (his 10–11px buttons fail this); safe-area insets; his
sub-page "‹ back" pattern becomes standard push navigation with swipe-back.

**In-case navigation.** His in-case search jumps to headings; add a sticky
**heading TOC** (1…13 chips) on the case file so jumping is always available,
search or not.

**Forms.** Native date pickers, comma-tolerant number paste for comms registers,
CIO dropdown with inline "add officer" (no tab round-trip).

**Accessibility & contrast.** Keep the palette but enforce WCAG AA: brass text
on paper and 8–10px mono labels need size/weight bumps; visible focus rings;
labels on icon-only buttons (🔒, ⛃).

**Dark mode.** His is light-only (`color-scheme: light`). Provide a true dark
variant of the same grammar (ink becomes the surface, paper the text; severity
hues re-tuned) — iPad evening use is real.

**Motion.** Keep his `.tap` press-scale; add gentle view transitions and
list-reorder animation (▲▼ re-rank). Nothing showy.

**Print/export.** Keep A4 briefing print + add the .doc export; print styles for
registers (custody ledger especially — it gets shown to courts).

**Trust surface.** His saved-tag ("saved to disk file 14:32") + backup FAB +
"3 copies, 2 media, 1 offsite" nudge are good trust UX — keep, wired to
CaseClock's real sink/backup machinery, plus last-backup-age warning.

## 4. Explicit non-adoptions (UI)

- No `prompt()/alert()/confirm()` anywhere.
- No 8–10px type on interactive elements (scale up, keep the mono grammar).
- No overwrite-in-place hearing rollover (delta §5.4 — new row + dispose).
- His SVG mind map / links graph are placeholders — list-first layouts ship
  first, richer canvases later (V3 §10 already specs the fuller mind map).

## 5. Order of work

Design tokens + app shell (rail/tab nav, header, lock screen) land **with T1**;
each subsequent tier ships its screens in the new language so there is no
two-styles period: T1 = shell + dashboard + index + case-file headings; T2 =
registers/sub-pages + stepper; T3 = Links, Calendar, CIO, Reference, briefing,
dark mode.
