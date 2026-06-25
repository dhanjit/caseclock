# REQUIREMENTS.md — the authoritative build target

> Verbatim-faithful transcription of the officer's **"Case & Trial Monitoring System —
> Requirement Specification & Confirmed Build Plan, Version 2 (All Specifications
> Finalised)"**. This is the **absolute floor**: the product must implement all of
> it. Extras are allowed only when they do not dilute or hide what the officer needs.
>
> Source: `Case Monitoring Plan Record.docx` (provided 25 Jun 2026).

## 1. Purpose & Scope
- Follow-up + reminder mechanism for every case across the **full lifecycle** — FIR registration → investigation → charge sheet → trial monitoring.
- A **unified dashboard**: bird's-eye view of all cases and what needs attention.
- Input: the user feeds the case brief (FIR dates, arrests, evidence, pointers); the system organises it into a structured, trackable record.

## 2. Priority & Reminder Logic
- **Superior Court Zone** (top priority, separately highlighted): SLPs at Supreme Court, Writ Petitions and similar constitutional/appellate matters at SC & HC. Visually flagged apart from routine court work.
- **Routine court matters** (under "Court Matters" with dates): bail objection, remand extension, etc.
- Standard reminders begin **15 days before** any due date; **custody production reminder fires 1 day prior**.

## 3. Fixed Case Structure — 13 headings, in this exact order
1. Case number
2. Identity of the case (most fundamental, 1 line)
3. Sections of law
4. Date of occurrence
5. Date of registration
6. Brief of the case
7. Number of accused
8. Progress of investigation
9. Evidences collected (with report mapping + No. of witnesses column)
10. Status of trial
11. Court matters (with dates)
12. List of accused with status (incl. LOC / Interpol + custody history)
13. Plan of action

## 4. Two Deadline Engines → one dashboard
Two distinct engines feed the same dashboard, **visually tagged** so an investigation deadline is told apart from a trial deadline at a glance.

### 4.1 Investigation Deadline Engine
- **Progress Reports (PR):** First PR ≤ 15 days of registration; monthly PR reckoned from the 1st of each month; turns **critical by the 7th** (never pending beyond 7 days). Court PR begins after charge sheet of all accused or closure.
- **Final Reports (FR):** driven by date of arrest (table below). FR-II submitted simultaneously; SP (Branch Head) comments ≤ 1 week of FR-II; hierarchy SP → DIG → IG → ALA → LA → ADG/SDG → DG is **indicative only**. **Single hard flag:** if DG order is not passed within 7 days of SP remarks, raise an alert.
- **Custody (BNSS):** statutory chargesheet limit **180 / 90 / 60 days** linked to date of arrest + offence type; user feeds **custody end date** → reminder 1 day prior; previous custody recorded as history.

| Case type | Statutory limit | Buffered target |
|---|---|---|
| UAPA cases | 150 days (5 months) from arrest | 150 days (as specified) |
| Scheduled offence (higher) | 90 days from arrest | 75 days from arrest |
| Scheduled offence (lower) | 60 days from arrest | 45 days from arrest |

Both the buffered target and the **true statutory date** are shown as a safeguard.
*(Open confirm: UAPA "150" vs statutory 90→180 — implemented configurable, prefilled 150, statutory shown alongside.)*

### 4.2 Court Trial Deadline Engine
Separate module, connected to the dashboard, tracking trial-specific events: next hearing date · bail hearing date (if any) · witness examination/deposition dates · charge framing date · final arguments · judgment/order date · any **superior-court (SC/HC) listing** — distinct highlight + 15-day reminder.

## 5. Attached Panels (per case)
- **Reference Laws** (preloaded, read-only, with source citations): NIA Act 2008 (as amended 2019) + Scheduled Offences; Foreigners Act; Emigration Act — authentic government sources, latest amended versions.
- **Banned Organisations / Terrorists:** manual entry by user; **linked system-wide** — whenever a fed name appears anywhere (incl. the 13 headings), it is **auto-marked RED**.
- **Evidence ↔ Report mapping:** each evidence paired with the report to be obtained (pending/received) + No. of Witnesses column.
- **Sanctions:** statutory sanctions + DG sanctions — tracked required / pending / obtained.
- **Place of Occurrence:** plotted on a map within the case.
- **LOC / Interpol Notices:** trackable per accused (LOC, Red Corner Notice, etc.).

## 6. Accused Status — 11 values (each a distinct colour)
1. Police custody · 2. Judicial custody · 3. Not arrested · 4. Absconding · 5. Killed / Dead · 6. Surrendered · 7. Approver · 8. Charge-sheeted · 9. Under investigation · 10. Acquitted · 11. Dropped (name removed / not sent for trial).

## 7. Build phases (our delta on the existing foundation)
- **Phase 1 — Case skeleton:** the 13 headings + 11 accused statuses + capture form. *(this phase)*
- **Phase 2 — Two engines:** Investigation (PR · FR + DG-flag · arrest-anchored buffered custody) + Court-Trial; one tagged dashboard; Superior Court Zone.
- **Phase 3 — Panels:** evidence↔report+witnesses · sanctions (statutory + DG) · LOC/Interpol + custody history · banned-orgs watchlist (auto-RED) · reference laws · place-of-occurrence map.
- **Phase 4 — Polish + deploy.**

Reused untouched: encrypted storage + vault + lock + backup · the rules-engine machinery · dashboard/agenda/alerts · case model + repository + migrations · the Cloudflare deploy pipeline.
