# RESEARCH.md — Case‑Tracking & Statutory‑Deadline Dashboard

> Local‑first, single‑user, encrypted case‑tracking and statutory‑deadline cockpit for an Indian **investigating officer** handling serious / special‑law (UAPA) cases.
> **Web first → Android → iOS** from one TypeScript codebase. **No cloud. All data on device, encrypted at rest.**
> This document is the authoritative design brief and drives the build plan.

**Legal regime in force:** BNSS 2023 / BNS 2023 / BSA 2023 (commenced **1 July 2024**), UAPA 1967 (as amended 2019), NIA Act 2008, NSA 1980. CrPC equivalents are noted where they aid migration.

**A note on legal accuracy.** Day‑counts and section references below have been adversarially re‑verified. Where a verification marked an item **confirmed** or **corrected**, that value is used over the raw research. Items marked **uncertain** are flagged inline as **"verify before relying."** Statutory citations in the app must be code‑accurate because they may be quoted in court or in supervisory notes — a mis‑cited clause is a real liability.

---

## 1. Executive Summary

We are building a **private supervision‑and‑memory layer** for a senior supervising police officer — a local‑first dashboard that:

1. **Computes the statutory clocks** that the official systems ignore, and alerts ahead of each one with the correct lead time; and
2. **Restores full case context** the moment a case is reopened after a gap ("here is where I left it, what's next, what's overdue").

**The gap it fills.** India's official stack — **CCTNS** (police record), federated through **ICJS** with e‑Courts / e‑Prisons / e‑Forensics / e‑Prosecution — is a system of **record and integration, not personal supervision**. It is FIR/station‑centric and entry‑heavy. It has:

- no per‑officer "my supervised cases" workspace,
- no "next action / current status" field,
- no personal reminder engine tied to each case's arrest/remand date,
- no computation of the BNSS / UAPA / NSA deadlines that decide whether the State keeps custody.

The official **case diary** (BNSS s.192/193) is a backward‑looking narrative written for the court, not a forward task list. So the officer falls back to **pocket diaries, paper pendency registers, Excel sheets, and WhatsApp pings to IOs** — unstructured, un‑alerting, scattered, and (for WhatsApp/consumer cloud) acutely insecure given documented large‑scale Indian police/biometric data leaks.

Two failures recur and are the core problems this app solves:

```
PROBLEM 1 — DEADLINE MISS (highest consequence)
  Chargesheet not filed in 60/90 days  →  irreversible DEFAULT BAIL  →  accused walks
  UAPA: 90→180 only if PP files progress+reasons report BEFORE day 90
  s.45 sanction 7+7 working days; NSA 12-day / 3-week / 7-week clocks
  → No personal tool does this date arithmetic or alerts on it.

PROBLEM 2 — CONTEXT DISCONTINUITY
  Officer returns from VIP bandobast / festival duty / leave after ~2 weeks
  → must reconstruct from memory or a thick file: where it stood, last action,
    next action, who owes what, what is overdue.
  → CCTNS shows static records, not "what was I doing and what's due."
```

**Why local‑only is structural, not cosmetic.** Live investigation/terror data is among the most sensitive data the State holds. A local‑only app means data never leaves the device — no cloud breach surface, no third‑party server, no remote subpoena target. This matches the very instinct that already drives officers to paper, while adding the deadline computation and context continuity paper can never provide. The trade‑off: **no remote wipe, no server backup** — mitigated by strong on‑device encryption, app lock, wipe‑after‑N, and offline encrypted export (Section 11).

---

## 2. Personas

### 2.1 Primary — The supervising police officer ("the officer")

| Attribute | Detail |
|---|---|
| Role | A supervising police officer who oversees serious cognizable cases, including UAPA / special‑law matters. |
| Caseload | 30–80 live supervised matters simultaneously; a handful are heinous/special‑law with merciless statutory clocks. |
| Rank context | Sits at the DSP+ approval gates (FIR refusal, preliminary enquiry, certain arrests) and supervises IOs via case‑diary scrutiny. |
| Duty pattern | Constantly interrupted — law & order, VIP bandobast, festival duty, court, leave. Cases advance in fits and starts; gaps of days–weeks are normal. |
| Devices | Personal Android phone primary; a laptop/desktop for desk review. Wants the same data on both, offline. |
| Tech comfort | Comfortable with apps, not a power user; will abandon anything that needs heavy data entry or feels like CCTNS. |
| Security posture | Rightly paranoid about cloud/WhatsApp for live‑case data; expects biometric lock and on‑device storage. |

**Supervisory needs (what the officer's job actually is):**
- A personal **"my supervised cases"** queue — the thing CCTNS does not give them.
- **Case‑diary scrutiny + supervisory notes**: record a dated written direction ("verify CDR of X; obtain FSL report; complete by <date>") and track whether the officer's own order was complied with.
- Run the **review machinery**: the monthly **district crime conference** (station‑by‑station), weekly/fortnightly circle reviews, standing monitoring of heinous/special‑law cases, and the **>3m / >6m / >1yr** long‑pending buckets. *(These review cadences are administrative — State Police Manual / PRB Reg. 54 — not BNSS statutory; the app must label them as departmental, not cite them as statutory in court.)*
- **Court & prosecution monitoring**: next hearing, which witnesses are due and whether secured, **sanction status**, legal opinion, appeal decision within limitation.

**Memory / context needs:**
- On reopening after a gap, instantly see **last supervisory note + the next action the officer themselves ordered**, where the case sits in the pipeline, which statutory/court clock is running, and what is overdue.
- A "**never‑forget engine**": every pending case carries *last action / next action due / review‑by date*; anything overdue or untouched floats to the top.
- Survive **transfer/handover**: pending + important cases and open next‑actions exportable into a clean handover snapshot, because the institutional registers are station‑held and don't travel with them.

### 2.2 Secondary (context only — not separate logins)
- **The IO** — owes the officer next actions; the officer tracks but does not operate the app on the IO's behalf.
- **The Public Prosecutor (PP)** — the officer tracks "PP briefed Y/N", PP must be heard before bail in grave offences, and the **PP (not the IO)** files the UAPA 43‑D(2) extension report.
- **Jail Superintendent** — relevant for s.479 undertrial‑release duty tracking.

> Single‑user app: one officer, one encrypted store. No multi‑tenant, no roles, no sharing. Other actors appear only as fields/contacts on a case.

---

## 3. Core Use Cases

> Each: **Trigger → Goal → What the app does.**

**UC‑1 — Register / add a supervised case**
- **Trigger:** FIR registered (or Zero‑FIR/e‑FIR/complaint directed under BNSS 173(4)/175(3)); the officer becomes supervising officer.
- **Goal:** Get the case into "my supervised cases" with the anchor dates that drive every clock.
- **App:** Capture FIR no./date/time, PS/district, BNS/UAPA sections + punishment band, IO, arrest date, **first‑remand date** (the s.187 clock anchor). From punishment band + flags, **auto‑derive** the 60/90 track, the 7yr+ forensic trigger, default‑bail risk date, and (if UAPA) the 90/180 + sanction tracks. Seed the activatable phases and their deadlines.

**UC‑2 — Log a supervisory note / case‑diary scrutiny**
- **Trigger:** The officer reviews the case diary or gets an IO update.
- **Goal:** Record a dated direction and the single next action, with a review‑by date.
- **App:** Append a timeline `SupervisionEntry` (last action, note text, **next action + who owes it**, next‑review date). Updates `lastTouchedAt`, recomputes "untouched" staleness, and drives the never‑forget sort.

**UC‑3 — Watch the chargesheet / default‑bail clock**
- **Trigger:** Case in custody; clock running from first remand.
- **Goal:** Never lose a case to default bail.
- **App:** Countdown from first‑remand date on the correct 60/90 track; escalating alerts (15/7/3/1 days); a persistent **OVERDUE** tier if the day passes. UAPA cases swap in the 90→180 + PP‑report logic.

**UC‑4 — Track the UAPA extension + sanction tracks**
- **Trigger:** UAPA/terror case approaching day 90; evidence package being assembled.
- **Goal:** File the PP progress+reasons report **before** day 90; complete the 7+7‑working‑day sanction before cognizance.
- **App:** Alerts ~15–20 days before day 90 to draft/file the PP report; separate countdowns for evidence‑to‑Authority → Rule 3 (7 wd) → Rule 4 (7 wd); flags "PP report filed before day 90? Y/N", "sanction annexed? Y/N".

**UC‑5 — Track preventive detention (NSA) in parallel**
- **Trigger:** NSA/PSA detention order passed alongside the criminal case.
- **Goal:** Hit every NSA clock; a miss voids the detention.
- **App:** Parallel track with order date → State approval (12d, 15d under the s.3(4) proviso) → grounds served (5d, up to 10d) → Advisory Board reference (3 weeks) → Board report (7 weeks) → 12‑month ceiling. Also the s.3(5) 7‑day report to the Centre.

**UC‑6 — Prepare for a court date**
- **Trigger:** Hearing approaching.
- **Goal:** Walk in prepared; don't lose witnesses to delay.
- **App:** 7–10 days out, surface the hearing, which witnesses are due + secured/summoned status, exhibits, PP‑briefed flag, sanction status, "what the court wants next time", adjournments used vs the cap of 2/party.

**UC‑7 — Oppose bail effectively**
- **Trigger:** Regular/anticipatory/default bail application listed.
- **Goal:** File objections, brief PP, produce antecedents in time.
- **App:** 3–5 days out: checklist (status report filed, case‑diary extracts annexed, PP briefed, prior convictions produced). Flags grave‑offence matters where PP must be heard (s.480 proviso) and anticipatory‑bail bars (rape/gang‑rape of minor, s.482).

**UC‑8 — Periodic case review (the crime conference)**
- **Trigger:** Monthly district crime conference / weekly circle review, or a review‑by date passing.
- **Goal:** Walk station‑by‑station; surface stale + long‑pending cases; record fresh directions.
- **App:** Review view grouped by station and by **>3m/>6m/>1yr** bucket, sorted so overdue‑review and untouched cases float up; capture reason‑for‑delay + next‑review date per case.

**UC‑9 — Reopen a case after a gap (context restore)**
- **Trigger:** The officer opens a case not touched for N days.
- **Goal:** Instant "where I left it."
- **App:** Context‑restore header (Section 9): last action + date, the next action the officer ordered, recent timeline, what's next, what's overdue, every running clock.

**UC‑10 — Post‑judgment & appeal**
- **Trigger:** Judgment delivered.
- **Goal:** Decide and file appeal within limitation.
- **App:** Record outcome + reason (esp. acquittal cause), start the limitation clock (Sessions ~30d / HC ~60d, **from the Limitation Act**, condonable), alert 30/7 days before, capture the appeal decision.

**UC‑11 — Daily caseload digest**
- **Trigger:** App open / each morning.
- **Goal:** One glance: due today, stale, hearings, overdue across all cases.
- **App:** Home dashboard agenda (Section 10), recomputed every open.

**UC‑12 — Encrypted backup / handover export**
- **Trigger:** Routine backup, device change, or officer transfer.
- **Goal:** Move data safely off‑device without a server; produce a handover snapshot.
- **App:** Offline encrypted export protected by a separate backup passphrase; portable across web↔mobile; optional human‑readable handover snapshot of pending + important cases and open next‑actions.

---

## 4. User Journeys

### (a) Add a case manually
1. Home → **+ New Case**.
2. **Step 1 Identity:** FIR no., date/time, PS, district; flags (Zero‑FIR, e‑FIR, NIA‑scheduled, UAPA).
3. **Step 2 Offence:** pick BNS/UAPA sections from a lookup that carries the **punishment band** → app derives 60 vs 90 track, 7yr+ forensic trigger, and (UAPA) the special tracks. Officer can override the derived track (the "10 years or more" edge case — see §5 note).
4. **Step 3 People:** accused (with custody status), IO, PP, victim/informant.
5. **Step 4 Anchors:** arrest date/time, **first‑remand date** (explicitly distinct from arrest — the clock runs from first remand). App previews the computed default‑bail‑risk date live.
6. **Step 5 First note:** a one‑line current status + next action + review‑by date.
7. **Save** → case enters "my supervised cases"; deadlines and activatable phases are seeded; agenda updates.

> Design rule: minimum mandatory fields = FIR no., section(s)/band, arrest + first‑remand dates. Everything else is progressive. Heavy forms are why officers abandon CCTNS.

### (b) Reopen a case after 2 weeks, full context restored
1. Officer back from bandobast; opens the case (or taps it from "Cases needing attention").
2. A **"Since you were last here"** banner shows days elapsed and a context‑restore block:
   - **Last action:** "Reviewed CD; directed IO to obtain CDR of accused‑2" — *11 days ago*.
   - **Next action I ordered:** "CDR + FSL report" — owed by IO — **review‑by date was 4 days ago → overdue**.
   - **Recent timeline:** last 5 supervision entries, newest first.
   - **What's next / clocks:** "Chargesheet (90‑day track) due in 12 days"; "Bail hearing in 3 days".
   - **Overdue (red):** the lapsed review; victim 90‑day update due in 2 days.
3. Officer acts directly from the block (log a note, snooze, mark next action done), and leaves with the case re‑anchored — no file dig, no WhatsApp to the IO.

### (c) Alert about an upcoming bail hearing / chargesheet deadline
1. Mobile: an **OS notification** fires (e.g., "Chargesheet 90‑day track — Case 47 — 7 days left"); web: a red badge + banner on next open.
2. Tap → case detail scrolled to the relevant clock with the actionable checklist (draft chargesheet ready? PP briefed? extension report needed?).
3. **Snooze 1d** / **Acknowledge** from the notification action. Acknowledging a soft alert clears it; a **statutory OVERDUE** alert does **not** silently clear — it persists and re‑notifies daily until resolved.

### (d) Prep for a court date
1. 7 days out, alert: "Hearing in 7 days — Case 47 — PW‑3 (doctor), PW‑5 (panch) to be examined."
2. Court‑prep panel: witnesses due + secured/summoned status, exhibits ready, PP briefed, sanction annexed, what the court asked last time, adjournments used (1 of 2).
3. Officer ticks summons served, flags a wobbling witness in a private note, sets a follow‑up. Walks in prepared.

### (e) Periodic case review
1. Monthly conference: open the **Review** view, grouped by station, sorted so overdue‑review + untouched + long‑pending float to the top, heavy clocks badged.
2. Station‑by‑station: for each pending case, read last action, record reason‑for‑delay, issue a fresh next action + next‑review date; reassign IO if stalled.
3. Long‑pending buckets (>3m/>6m/>1yr) get a mandatory reason‑for‑delay. Close the conference; every reviewed case now carries a fresh review‑by date, so next month's list rebuilds itself.

---

## 5. Case Lifecycles & Statutory Clocks (the legal heart)

> **Authoritative deadline table.** "Verified?" reflects the adversarial verification. Clocks are **date‑bound** — compute on **local calendar dates**, not UTC instants, or you risk off‑by‑one on the most consequential alerts. Several clocks run **from first remand**, not arrest — store both and anchor on first remand.

### 5.1 Ordinary cognizable case under BNSS

| # | Deadline | Day‑count | Law ref | Anchor | Consequence if missed | Verified? |
|---|---|---|---|---|---|---|
| 1 | e‑FIR signature by informant | **3 days** | BNSS **173(1)(ii)** | e‑FIR filed | e‑FIR not validly on record | **Corrected** — day‑count right; clause is 173(1)(ii), *not* a proviso to 173(1) (that proviso is woman‑officer recording of women‑victim offences). |
| 2 | Preliminary enquiry cap (3–<7yr) | **14 days** | BNSS 173(3) | DSP approval / PE start | Must register FIR or proceed | **Confirmed** — bounded (cf. open‑ended Lalita Kumari); see *Imran Pratapgarhi v. State of Gujarat (2025)*. |
| 3 | Production before magistrate | **24 hours** (excl. journey) | BNSS **58** + **187(1)**; Art. 22(2) | Arrest | Detention illegal; officer liable | **Confirmed** — first production must be **in person**; only later remands by audio‑video. |
| 4 | Police‑custody window (parts rule) | **15 days PC within first 40/60 days** | BNSS 187(2)/(3) | First remand | PC quota lost; only judicial custody after | **Confirmed** — genuine BNSS change from CrPC 167; 40 days for 60‑day track, 60 days for 90‑day track. |
| 5 | **Chargesheet — 60‑day track (DEFAULT BAIL)** | **60 days** | BNSS 187(3) | **First remand** | **Indefeasible default bail** | **Confirmed** — offences *not* punishable death/life/10yr+. |
| 6 | **Chargesheet — 90‑day track (DEFAULT BAIL)** | **90 days** | BNSS 187(3) | **First remand** | **Indefeasible default bail** | **Confirmed** — death/life/**"not less than ten years"** (exactly 10 yrs ⇒ 90‑day track). |
| 7 | Victim progress update | **90 days** | BNSS **193(3)(ii)** | Info recorded | Statutory breach; HC has directed DGPs to enforce | **Confirmed** (clause is **(ii)**, not (i)). |
| 8 | Rape‑victim medical report to IO | **7 days** | BNSS **184(6)** | Exam | Evidentiary gap | **Confirmed** — also a **24‑hour** clock to *send* the victim for exam. |
| 9 | Mandatory forensic crime‑scene visit | **Trigger = 7yr+** (not a day‑count) | BNSS 176(3) | FIR (qualifying offence) | Weak prosecution; non‑compliance flagged | **Confirmed** — **but** a State may defer up to **5 years** by notification; not fully operational everywhere. **Verify state rollout before treating as a hard bar.** |
| 10 | Search & seizure videography / forwarding | "without delay" | BNSS 105 (w/ 176(3), 185) | Search/seizure | Evidence challengeable | **Confirmed (added in verification)** — record on mobile AV, forward to magistrate without delay. |
| 11 | Further‑investigation cap | **90 days** | BNSS 193(9) proviso | Further‑invest. start | Needs court permission | **Confirmed** — also needs prior court permission to *commence*. |
| 12 | Supply of documents to accused/victim | **14 days** | BNSS 230 | Accused production/appearance | Charge‑framing delayed | **Confirmed** — duty on the **Magistrate/court**, but IO must furnish docs in time (downstream checkpoint). |
| 13 | Committal to Court of Session | **90 days (max 180)** | BNSS 232 | Cognizance | Procedural delay; written reasons to extend | **Confirmed.** |
| 14 | Discharge application | **60 days** | BNSS 250(1) (sessions) / 262(1) (warrant) | Commitment / doc supply | Right *may* lapse | **Confirmed**, *with caveat*: "may" ⇒ Kerala HC holds it **directory**, not mandatory; don't present as strictly indefeasible. |
| 15 | Charge framing | **60 days** | BNSS 251(1)(b) (warrant) / 263 (sessions) | First hearing on charge | Procedural delay | **Confirmed (added in verification)** — new vs CrPC. |
| 16 | Sexual‑offence investigation limit | **2 months** | BNSS 193(2)/(3) | Info recorded | Adverse judicial notice (directory) | **Corrected** — covers BNS ss.**64–68, 70, 71** + POCSO ss.4,6,8,10 only. **s.69 is NOT included**; don't treat "all sexual offences/all POCSO" as in scope. |
| 17 | Sexual‑offence **trial** completion | **2 months from chargesheet** | BNSS 346 proviso / 193 (510 child witness) | Chargesheet | Delay flagged | **Added in verification** — distinct from the *investigation* limit. |
| 18 | Adjournment cap | **Max 2 / party** | BNSS 346 | Per party | Court refuses further adjournment | **Confirmed.** |
| 19 | Judgment after arguments | **30 days (max 45)** | BNSS 258 (sessions) / 392 (general) | Arguments concluded | Delay needs recorded reasons | **Confirmed.** |
| 20 | Plea‑bargaining application | **30 days** | BNSS 290 | Charge framing | Window lapses | **Added in verification** — offences <7yr. |
| 21 | Appeal to Court of Session | **~30 days** | BNSS **415(3)** + Limitation Act Art. 115(b)(ii) | Judgment | Barred unless condoned (s.5) | **Confirmed** — day‑count from **Limitation Act**, not BNSS. |
| 22 | Appeal to High Court | **~60 days** | BNSS **415(2)** + Limitation Act Art. 115(b)(i) | Judgment | Barred unless condoned | **Confirmed** — **exception:** death‑sentence appeal from Sessions = **30 days** (Art. 115(a)). |
| 23 | Appeal **against acquittal** | **HC 90 days / Sessions 30 days** | BNSS **419** + Limitation Act Art. 114 | Order | Right lost unless condoned | **Confirmed** — forum/who‑may‑appeal in s.419; day‑counts in Limitation Act. |
| 24 | Mercy petition after death sentence | **30 days (60 if multiple convicts)** | BNSS 472 | Convict informed | Window lapses | **Added in verification.** |

### 5.2 Bail clocks (BNSS Chapter XXXV)

| Deadline | Day‑count | Law ref | Consequence | Verified? |
|---|---|---|---|---|
| **Default bail — 60/90 day** | 60 / 90 days from **first remand** | BNSS 187(3) | Indefeasible right — **but must be *claimed*** (application + ready to furnish bond) **before** a valid chargesheet is filed; a chargesheet filed first **extinguishes** it. Once granted, generally not undone merely by late filing. | **Corrected** — original "automatically irreversible at day 60/61" overstates; it is indefeasible *but conditional on being availed*. Count from **first remand**, not arrest. |
| Police‑custody window | 15 days within first 40 (≤10yr) / 60 (grave) days | BNSS 187(2)/(3) | PC quota lost | Confirmed. |
| Undertrial first‑time‑offender release | **1/3 of max sentence** | BNSS 479(1) 1st proviso | Release **on bond** by Court; **Jail Supt. has duty (s.479(3)) to apply** | Confirmed — barred if multiple pending offences/cases. |
| Undertrial general release | **1/2 of max sentence** | BNSS 479(1)+(3) | Release on bail | Confirmed — **not** if death/life specified, or multiple offences/cases; **applies retrospectively** (SC, Aug 2024). |
| Indigent‑accused presumption | **7 days** | BNSS 478 proviso | Release on personal bond, no surety | Confirmed. |

### 5.3 UAPA / terror clocks (override the ordinary 60/90)

> For UAPA cases the **BNSS 60/90 default does not apply** — the UAPA clock does. This is the single most common default‑bail trigger in terror cases.

| Deadline | Day‑count | Law ref | Consequence | Verified? |
|---|---|---|---|---|
| UAPA chargesheet ceiling | **90 days** (from first remand) | UAPA **43‑D(2)(b)** w/ BNSS 187(3) | Default bail unless validly extended | Confirmed. |
| **43‑D(2) PP‑report extension window** | **Report + judicial satisfaction BEFORE day 90** | UAPA 43‑D(2)(b) proviso | No valid extension ⇒ default bail. A report filed on/after day 90, or without showing progress, is **fatal**. | Confirmed — **PP (not IO)** files; slow progress in first 90 days bars extension. |
| Extended ceiling | **180 days** (absolute max) | UAPA 43‑D(2)(b) | Default bail on application | Confirmed. |
| UAPA police‑custody cap | **up to 30 days PC** | UAPA 43‑D(2)(a) | (Distinct from BNSS 15‑day cap) | **Added in verification** — track separately. |
| s.45 sanction — Authority recommendation | **7 working days** of receiving IO evidence | UAP (Recommendation & Sanction) Rules 2008, **Rule 3** + s.45(2) | Mandatory (*Fuleshwar Gope v. UoI*, 2024 INSC 718); breach can void cognizance & support bail | Confirmed. |
| s.45 sanction — Government decision | **7 working days** of recommendation | Rules 2008, **Rule 4** + s.45(2) | Mandatory; total ≈ **14 working days**; independent application of mind required | Confirmed. |
| Bail bar | (no clock) | UAPA **43‑D(5)** | Court **must deny** bail if accusation prima facie true (*NIA v. Watali*, 2019) | Confirmed — context, not a deadline. |

**NIA Act handover chain**

| Step | Timing | Law ref | Verified? |
|---|---|---|---|
| SHO → State scheduled‑offence report | "forthwith" | NIA Act S.6(1) | Confirmed. |
| State → Centre | "as expeditiously as possible" | S.6(2) | Confirmed. |
| Centre's handover determination | **15 days** | S.6(3)–(4); suo motu S.6(5) | Confirmed — on direction, State ceases & transmits records (S.6(6)/(7)). |

### 5.4 Preventive detention (NSA 1980 / State PSAs)

> A missed clock **voids** the detention. State PSAs (e.g., J&K PSA) have analogous but distinct clocks — **verify the specific PSA before relying**.

| Deadline | Day‑count | Law ref | Verified? |
|---|---|---|---|
| DM/CP order → State approval | **12 days** (→ **15 days** if grounds served between day 5 and 10, s.3(4) proviso) | NSA **S.3(4)** + proviso | **Corrected** — original mis‑attributed to S.3(5); add the 15‑day proviso. Unapproved order **lapses**. |
| State report to Central Govt | **7 days** | NSA **S.3(5)** | **Added in verification** — separate clock from the 12‑day approval. |
| Grounds of detention served | **5 days**; up to **10 days** for recorded reasons | NSA **S.8(1)** | **Corrected** — drop the general "15 days." The 15‑day option is only the **spent S.14A disturbed‑area** regime (pre‑8 June 1989 detentions), **not** the ordinary rule. Late/inadequate grounds vitiate detention (Art. 22(5)). |
| Reference to Advisory Board | **3 weeks** | NSA S.10 | Confirmed. |
| Advisory Board report | **7 weeks** | NSA S.11(1) | Confirmed. |
| Representation considered | "utmost expedition" (no fixed count) | Art. 22(5) + NSA S.8/10/11 | **Added in verification** — independent of, and prior to, the Board; unexplained delay vitiates. |
| Maximum detention | **12 months** | NSA S.13 | Confirmed — revocable/extendable on fresh grounds. |

---

## 6. Case Phases / States

A case moves through a **primary pipeline**, but several clocks live on **parallel tracks** and some **phases activate later** (a task due next week, not today). The status model must represent all three.

### 6.1 Primary pipeline (status)
```
Registered → Investigation → Custody/Remand → Chargesheet → Cognizance
   → Committal (if Sessions-triable) → Charge framed → Trial
   → Judgment → Appeal/Closed
```
Each status has entry data and may activate deadlines (e.g., entering **Custody/Remand** activates the 60/90 chargesheet clock and the PC window; **Cognizance** activates the 14‑day document‑supply and committal clocks).

### 6.2 Parallel tracks (run independently, overlap the pipeline)
- **Bail track:** application type (478/480/482/483/187(3)/479) → hearing(s) → grant/reject/default → conditions/bond/surety → breach/cancellation (483) → undertrial s.479 release. Independent of pipeline status.
- **Sanction track (UAPA/PC Act):** evidence‑to‑Authority → Rule 3 recommendation → Rule 4 sanction → annexed to chargesheet. A stuck sanction can sink the case regardless of pipeline progress.
- **Preventive‑detention track (NSA/PSA):** order → State approval → grounds → Board reference → Board report → confirmation → 12‑month ceiling. Wholly separate from the criminal case.
- **NIA‑handover track:** report → 15‑day determination → handover/retained.

### 6.3 "Phases that activate later" (deferred / scheduled phases)
A case carries phases whose deadlines are **not yet due**. The model stores each as a **derived Deadline** with a `dueAt` and `activatesAt`/`leadOffsets`. A phase is:
- **Latent** — applicable but no live clock yet (e.g., committal before cognizance).
- **Active** — clock running, surfaced in Today/Upcoming as it nears.
- **Overdue** — passed; persists loudly (statutory ones never auto‑clear).
- **Done / N/A** — completed or not applicable (e.g., committal for a non‑Sessions case).

```
Case 47 (UAPA, 90→180 track)
 ├─ Pipeline: Custody/Remand ●  (active: chargesheet day-90, PC 60-day window)
 ├─ Bail track:        hearing in 3d ●
 ├─ Sanction track:    evidence→Authority done; Rule 3 clock running ●
 ├─ NSA track:         Advisory Board report due (7 wk) ●  [latent → active]
 └─ Later phases:      committal (latent), trial (latent), appeal (latent)
```

This is what lets the dashboard say "due next week, not today" and lets context‑restore answer "what's next."

---

## 7. Data Model

> Relational (SQLite). IDs are app‑generated. **Bold** fields **drive alerts**. Store dates as local calendar dates where they are legal day‑counts.

### 7.1 `Case`
Identity & classification: `id`, `firNumber`, **`firDateTime`**, `policeStation`, `district`, `zeroFirFlag`, `zeroFirTransferDate`, `eFirFlag`, **`eFirSignedDate`** (3‑day check), `modeOfInfo`, `freeCopyIssuedDate`.
Offence: `bnsSections[]`, `uapaSections[]`, `otherActs[]`, **`punishmentBand`** (drives 60/90 + 7yr+ + s.479 thresholds), **`trackOverride`** (manual 60/90 for the "10 years or more" edge case), `niaScheduledFlag`, `uapaFlag`, `sevenYearPlusFlag`, `sexualOffenceInScopeFlag` (BNS 64‑68/70/71 + POCSO 4/6/8/10 only).
Supervision: `ioName/Rank/Contact`, `supervisingOfficer`, **`priorityHeinousFlag`**, **`status`** (pipeline state), **`lastTouchedAt`** (drives staleness), **`nextReviewDate`**, `longPendingBucket` (derived >3m/>6m/>1yr), `reasonForDelay`.
Anchors (clock drivers): `arrestDateTime`, **`firstRemandDate`** (primary clock anchor), `custodyStatus`, `pcDaysUsed`, **`pcWindowExpiryDate`** (40th/60th day), `investigationCompletionDate`, **`chargesheetDueDate`** (derived), `chargesheetFiledDate`, **`defaultBailRiskDate`** (derived), **`victimUpdateDueDate`** (90d), `furtherInvestStart` + **`furtherInvestDueDate`** (90d).
Court: `cognizanceDate`, `court`, `committalDueDate` (90/180), `committalOrderDate`, `chargeFramingDate`, `argumentsConcludedDate`, **`judgmentDueDate`** (30/45), `judgmentDate`, `outcome`, `acquittalReason`, **`appealDueDate`** (Sessions ~30 / HC ~60 / acquittal 90), `appealDecision`.

### 7.2 `Person` / `Accused`
`id`, `caseId`, `role` (accused/witness/victim/informant/surety), `name`, `aliases[]`, `identifiers`, `photoRef`, `orgAffiliation` (UAPA schedule), `priorConvictions`, **`firstTimeOffenderFlag`** (s.479), `otherPendingCases` (s.479/480 disqualifier), `custodyLocation`, `bailStatus`, `passportSurrendered`, contact. Witnesses also: **`securedSummonedStatus`**, protection flag.

### 7.3 `Hearing` / `CourtDate`
`id`, `caseId`, **`hearingDate`**, `court`, `purpose`, `witnessesDue[]` (+ secured/summoned), `exhibitsNeeded`, `whatCourtWantsNext`, `adjournmentsUsedThisParty` (vs 2), `outcomeNote`. **`hearingDate` drives the court alert.**

### 7.4 `Task` / `Reminder`
`id`, `caseId`, `title`, `owesWho` (IO/FSL/PP/court/self), **`dueDate`**, `pendingDependencyType` (FSL/sanction/CDR/PMR/witness), `status` (open/done), `selfSetFollowUp`. Pending dependencies overdue beyond a threshold trigger a "chase it" alert.

### 7.5 `Note` / `SupervisionEntry` (the context‑continuity timeline)
`id`, `caseId`, **`createdAt`**, `entryType` (cd‑scrutiny/supervisory‑note/io‑update/court‑note/private), `lastActionText`, `noteText`, **`nextActionText` + `nextActionOwes`**, **`nextReviewDate`**, `complianceStatusOfLastOrder`. Append‑only timeline; the newest entry's fields populate the case's `lastTouchedAt`, last‑action, and next‑action. **This is the spine of context restore.**

### 7.6 `Deadline` (derived — not hand‑entered)
`id`, `caseId`, `ruleId`, `type`, **`dueAt`** (local date), `severity` (statutory‑critical / statutory / soft / court), `lawRef`, `leadOffsets[]`, `activatesAt`, `state` (latent/active/overdue/done/na), `verified` (confirmed/corrected/uncertain — surfaced in UI). Generated by the rules engine from `Case` anchors; re‑derived on every relevant edit.

### 7.7 `Attachment`
`id`, `caseId`, `kind` (FSL ref / s.65B cert / seizure / order / photo / doc), `label`, `blobRef` (encrypted store), `addedAt`. Files stored encrypted; metadata in DB.

### 7.8 `AgencyCoordination`
`id`, `caseId`, `agency` (NIA/IB/State ATS/Special Branch/PP/FSL), `contactName`, `pocPhone`, `noteText`, `handoverStatus`, `dateReportToState`, `dateStateToCentre`, `centreDeterminationDueDate` (15d), `custodyTransferLog`.

### 7.9 `AlertState`
Keyed per **(caseId, ruleId, occurrenceDate)** — *not per rule* — `state` (pending/snoozedUntil/acknowledged/escalated). Shared source of truth for both the in‑app agenda and OS notifications, so they never drift. (Per‑occurrence keying so acknowledging today's review doesn't suppress next month's.)

**Fields that drive alerts (summary):** `firstRemandDate`→chargesheet/PC/default‑bail; `arrestDateTime`→24h production; `eFirSignedDate`→3‑day; `firDateTime`/info→victim 90d, sexual‑offence 2‑month; `hearingDate`→court; `victimUpdateDueDate`; `furtherInvestDueDate`; `nextReviewDate`→review‑overdue; `lastTouchedAt`→untouched‑N‑days; UAPA day‑90 + sanction Rule 3/4; NSA order→approval/grounds/board/12‑month; `appealDueDate`.

---

## 8. Alert & Reminder Engine

**Architecture: one pure rules engine → two projection layers.** The in‑app agenda is the **system of record**; OS notifications are a **best‑effort projection** that nudges the officer to open the app. Background scheduling is **never** the source of truth.

```
Case anchors ──► RULES ENGINE (pure fns) ──► Deadline[] ──► (A) In-app Today/Upcoming agenda  [system of record]
                                                       └─► (B) OS notifications              [best-effort nudge]
                                          AlertState (per caseId,ruleId,occurrence) keeps A & B consistent
```

### 8.1 Rules engine
Each rule is a pure function `(caseDates) → DeadlineEvent[]` returning `{caseId, ruleId, type, dueAt, severity, leadOffsets[]}`. Computed from anchors. Runs (i) on every **app open**, (ii) on any **case edit** (recompute that case, re‑materialize its OS notifications), (iii) in the web SW periodic‑sync handler when (rarely) granted.

**Lead times (from the research):**

| Event | Lead times | Severity |
|---|---|---|
| Chargesheet default‑bail (60/90) | **15, 7, 3, 1 days** + persistent OVERDUE | statutory‑critical |
| UAPA 43‑D(2) PP‑report window | **15–20 days** before day 90 (draft/file/hear), then 7, 3 | statutory‑critical |
| UAPA 90‑day / extended 180‑day | 7 days (90) / 10 days (180) | statutory‑critical |
| s.45 sanction (Rule 3 / Rule 4) | on package‑ready; at each 7‑working‑day clock | statutory‑critical |
| Police‑custody window (40/60th day) | 5 days before | statutory |
| Victim 90‑day update | 7 days before | statutory |
| Document supply (14d) | 3 days before | statutory |
| Committal (90d) | 10 days before | statutory |
| Discharge window (60d) | 7 days before | statutory (directory) |
| Judgment (30/45) | 5 days before | statutory |
| Bail hearing — prep | 3–5 days before | court |
| Court hearing — prep | 7–10 days before | court |
| NSA approval (12/15d) | 3 days before | statutory‑critical |
| NSA grounds (5/10d) | at day 4 | statutory‑critical |
| NSA Board ref (3wk)/report (7wk) | 4 days before each | statutory‑critical |
| NSA 12‑month | 30 days before | statutory |
| Appeal limitation (30/60/90d) | 30 days, then 7 | statutory |
| Review overdue | on/just before next‑review‑date | soft |
| Case untouched | 14 days no activity (also 7/30 configurable) | soft |
| Pending dependency overdue | when FSL/sanction/CDR/PMR awaited beyond threshold | soft |
| Daily caseload digest | each morning | digest |

### 8.2 "Today / Upcoming" agenda (system of record)
Recomputed from stored dates on **every app open** — deterministic, platform‑independent, no permissions, no 64‑slot cap. Drives a red badge/banner the one moment attention is guaranteed: when the officer opens the app. It also shows **overdue** items an OS notification may have missed. Buckets: **Today**, **Upcoming (next 30 days)**, **Overdue (persistent)**.

### 8.3 Snooze / Acknowledge / Escalation
`AlertState` per occurrence. Notification action buttons (**Snooze 1d**, **Acknowledge**) update state via `localNotificationActionPerformed`; the agenda reads the same state. Escalation = lead offsets intensify near `dueAt`; a distinct **OVERDUE** tier persists and **re‑notifies daily on mobile** until acknowledged — because a missed statutory deadline has legal consequences and must **not silently clear**.

### 8.4 Web vs mobile given no server

| | Web PWA | Mobile (Capacitor) |
|---|---|---|
| Reliable trigger | **App open only** (in‑app agenda) | **OS alarms** via `@capacitor/local-notifications` (fire when app closed) |
| Background notifications | Best‑effort: Periodic Background Sync (Chromium‑only, opportunistic, **absent on iOS/Safari/Firefox**) recomputes agenda + `showNotification()`. **Never load‑bearing.** No timed‑notification API ships; `setTimeout` dies with the SW; web push needs a server we don't have. | `schedule.at` (exact one‑shots), `schedule.every`+`count` (periodic reviews). Android: declare **USE_EXACT_ALARM** (Android 14+, core use) → fallback **SCHEDULE_EXACT_ALARM** + `checkExactNotificationSetting()` on launch (revocation deletes alarms). `allowWhileIdle` fine at day granularity. |
| Constraints | OPFS quirks (Safari private mode, WebView backgrounding) — pure‑web only | **iOS keeps only the 64 soonest** pending → schedule a bounded **30‑day horizon**, hard‑capped, **prioritized by severity + proximity** (statutory > soft). Re‑materialize on every open. OEM battery‑killers (Xiaomi/Oppo) can still kill alarms. |

**Honest ceiling:** if the officer never opens the app **and** background notifications fail, a statutory deadline can pass silently. Mitigations: make **mobile the strongly recommended path** for active officers; daily re‑notify on overdue; surface a persistent overdue tier on next open.

---

## 9. Context Continuity Design

The reopen‑after‑a‑gap moment is a first‑class feature. When a case is opened and `now − lastTouchedAt ≥ N` days, render a **context‑restore header** above the normal detail, assembled from the data model with **zero extra entry**:

```
┌─ SINCE YOU WERE LAST HERE · 13 days ago ───────────────────────────┐
│ LAST ACTION   Reviewed CD; directed IO to obtain CDR of accused-2  │
│               · 11 days ago (SupervisionEntry.lastActionText)      │
│ NEXT ACTION   CDR + FSL report  ·  owed by: IO                     │
│   I ORDERED   review-by was 4 days ago  ► OVERDUE                  │
│ WHAT'S NEXT   Chargesheet (90-day track) due in 12 days            │
│               Bail hearing in 3 days                               │
│ OVERDUE (●)   • Supervisory review (4 days late)                   │
│               • Victim 90-day update due in 2 days                 │
│ TIMELINE      last 5 supervision entries, newest first ▾          │
│ CLOCKS        chargesheet ▓▓▓▓▓░ 12d · PC window closes 6d ·       │
│               sanction Rule 3 running                              │
└────────────────────────────────────────────────────────────────────┘
```

It answers exactly the five questions the officer would otherwise reconstruct from a thick file:
1. **Last action** — newest `SupervisionEntry.lastActionText` + relative date.
2. **Open tasks** — open `Task`s + `nextActionText`/`owesWho`, overdue ones highlighted.
3. **Recent notes timeline** — last N `SupervisionEntry` rows, newest first.
4. **What's next** — nearest active `Deadline`s in plain language.
5. **What's overdue** — `Deadline.state = overdue` + lapsed review dates, red, persistent.

**Continuity mechanics:**
- Every supervisory note **must** capture *next action* + *review‑by date* (the never‑forget device) — a one‑line nudge in the note form, not a heavy form.
- `lastTouchedAt` updates on any substantive edit; staleness is derived, not manual.
- The same five blocks power **transfer/handover export** (Section 12): pending + important cases with their open next‑actions become the written handover snapshot the institutional registers don't carry.

---

## 10. Dashboard UI

Design language: clean, dense‑but‑calm, mobile‑first, **Tailwind + shadcn/ui**. Severity color: statutory‑critical = red, statutory = amber, court = blue, soft = slate. Big tap targets; minimal chrome; nothing that feels like CCTNS data entry.

### 10.1 Home dashboard
```
┌──────────────────────────────────────────────────────────────┐
│  Good morning, Officer.       🔒    [+ New Case]   [Search]   │
├──────────────────────────────────────────────────────────────┤
│  ● OVERDUE (3)   ▸ persistent red banner, tap to expand       │
├───────────────┬──────────────────────────────────────────────┤
│  TODAY        │  CASES NEEDING ATTENTION                      │
│  • Case 47 –  │  ▸ stale (untouched 14d+)                     │
│    chargesheet│  ▸ review-by passed                           │
│    7 days     │  ▸ heavy clock < 7d                           │
│  • Case 12 –  │  sorted: overdue → nearest statutory → stale  │
│    bail hrng  │                                              │
├───────────────┼──────────────────────────────────────────────┤
│  UPCOMING     │  QUICK STATS                                  │
│  (next 30d)   │  Live: 54 · UAPA: 6 · In custody: 9          │
│  grouped by   │  >3m: 11 · >6m: 4 · >1yr: 2                  │
│  date, badged │  Hearings this week: 7                        │
└───────────────┴──────────────────────────────────────────────┘
```
Information hierarchy: **Overdue (persistent red)** → **Today** → **Cases needing attention** → **Upcoming** → **Quick stats**. The agenda is recomputed on every open (the guaranteed‑attention moment).

Widgets: *Overdue banner* (statutory items never auto‑clear); *Today list* (due‑today deadlines + hearings, with action chips); *Cases‑needing‑attention* (stale / review‑passed / heavy‑clock, the never‑forget surface); *Upcoming* (30‑day, date‑grouped, severity‑badged); *Quick stats* (caseload + long‑pending buckets for the crime conference).

### 10.2 Case detail
```
┌─ Case 47 · FIR 112/2025 · PS Civil Lines · UAPA ──────────────┐
│  [Context-restore header — only if reopened after a gap]      │
├──────────────────────────────────────────────────────────────┤
│  CLOCKS STRIP (horizontal, severity-colored, countdowns)     │
│  chargesheet 12d │ PC window 6d │ sanction R3 │ hearing 3d    │
├───────────────┬──────────────────────────────────────────────┤
│  TABS: Overview · Timeline · People · Hearings · Deadlines ·  │
│        Tasks · Bail · Sanction · NSA · Attachments · Agency   │
├───────────────┴──────────────────────────────────────────────┤
│  Overview: status pipeline (with later phases dimmed),        │
│  offence + derived track, anchors, next action + review-by,   │
│  [Log supervisory note] primary button                        │
└──────────────────────────────────────────────────────────────┘
```
- **Clocks strip:** the running statutory/court clocks at a glance with countdowns and law refs (tap → the rule, its `verified?` badge, and a "verify before relying" note for uncertain items).
- **Pipeline:** primary status as a stepper; **parallel tracks** (bail/sanction/NSA) as their own tabs; **later phases dimmed** until active.
- **Timeline tab:** the append‑only `SupervisionEntry` log — the case's living memory.
- Primary action everywhere: **Log supervisory note** (last action / next action / review‑by) — the highest‑frequency, lowest‑friction interaction.

### 10.3 Add / edit flow
Progressive 5‑step wizard (Section 4a) for new cases; inline field edits afterward. Minimum mandatory: FIR no., section(s)/band, arrest + first‑remand dates. Derived track shown live and overridable. No long forms — staged disclosure.

### 10.4 Review view
Crime‑conference mode: group by station, sort overdue‑review/untouched/long‑pending to top, heavy clocks badged; per‑case capture of reason‑for‑delay + fresh next action + next‑review date. Filter by bucket (>3m/>6m/>1yr), by UAPA, by custody.

---

## 11. Security & Privacy Model

**Principle: confidentiality is structural — data never leaves the device, and even on‑device it is never plaintext at rest.** Do not depend on OS full‑disk encryption; the app's own crypto stands alone.

### 11.1 Local‑only
No cloud sync, no server, no telemetry. The only egress is a **user‑initiated, separately‑encrypted, offline export** (Section 11.5). Trade‑off accepted: **no remote wipe, no server backup** (documented to the user).

### 11.2 Encryption at rest — encrypted SQLite everywhere
- **Web:** `wa-sqlite` + **SQLite3 Multiple Ciphers** (SQLCipher‑compatible AES‑256, CBC+HMAC), run in a dedicated **Web Worker**, persisted via OPFS (`OPFSCoopSyncVFS`).
- **Mobile:** `@capacitor-community/sqlite` with native **SQLCipher** (AES‑256 whole‑file).
- **Same schema + same cipher params** (KDF iterations, page size, HMAC, plaintext‑header off) on both, so an encrypted export opens web↔mobile. **Round‑trip‑test the cipher params** or restore fails silently.
- Whole‑file encryption (not app‑level field encryption) so **no plaintext metadata** (case IDs, timestamps, key names) leaks — the decisive reason over a Dexie/IndexedDB‑encrypt‑each‑record approach.

### 11.3 Key handling — two‑key envelope (no plaintext key at rest)
```
passphrase ──Argon2id(per-install salt, MODERATE+, ~256MB)──► KEK
DEK = CSPRNG 256-bit  (actually encrypts the DB; never stored in plaintext)
wrapped-DEK = AES-256-GCM(KEK, DEK)
On disk: salt + nonce + wrapped-DEK + Argon2 params  (NOT the DEK)
Unlock: derive KEK → unwrap DEK in worker memory → open DB → zero KEK
Lock/background: close DB, zero DEK/KEK from memory
```
Argon2id over PBKDF2 because the primary threat is **offline cracking of a seized device image** (memory‑hardness matters most). Plaintext DEK lives **only in worker memory** while unlocked.

### 11.4 App lock + biometric + auto‑lock
- **Mobile:** wrapped‑DEK (or biometric‑gated DEK copy) in **iOS Keychain / Android Keystore** (Capacitor Vault / secure‑storage), gated by Face ID / Touch ID / fingerprint with device‑passcode fallback; hardware‑backed, non‑exportable. Passphrase remains the recovery path.
- **Web:** bind unlock to a **passkey via WebAuthn PRF** (authenticator HMAC derives/ wraps the KEK; secret never leaves the secure element). **PRF support is inconsistent on Safari/iOS — keep a robust Argon2id passphrase fallback; never make PRF the only web unlock.**
- **Auto‑lock:** on Capacitor `appStateChange→background` and web `visibilitychange`/`blur` + idle timeout (default **60s**): close DB, zero keys, require biometric/passcode to reopen.

### 11.5 Wipe‑on‑failed‑attempts + duress
- Tamper/rollback‑resistant **failed‑attempt counter** stored **in Keychain/Keystore** (signed/HMAC'd), not a plain file — a plain‑file counter can be reset by re‑imaging.
- After **N** failures (default **10**): delete the wrapped‑DEK and the Keychain/Keystore entry → DB becomes **permanently undecryptable (crypto‑erase)**.
- Optional **duress passphrase** that triggers the same crypto‑erase.

### 11.6 Encrypted backup / export (offline only)
- Export = the SQLCipher‑encrypted DB (or a fresh DB under a backup key) wrapped into one portable file: `header(version, Argon2 params, salt, nonce) + AES-256-GCM(wrapped-DEK) + ciphertext`.
- Protected by a **separate strong backup passphrase**, independent of the device unlock (so a backup isn't tied to one device's Keychain).
- Transfer **only** over offline channels (USB, local file, AirDrop/Nearby) — never a server.
- On import, **verify GCM tag + a stored HMAC** over the file before trusting it; reject on mismatch.
- Because web/mobile share the cipher format, a phone export restores on the web app and vice‑versa.

### 11.7 Threat model — seized device
| Threat | Defense |
|---|---|
| Device seized, imaged | Only AES‑256 ciphertext + wrapped‑DEK on disk; no plaintext, no plaintext metadata. |
| Offline passphrase brute‑force | Argon2id memory‑hardness makes it expensive; enforce a strong passphrase policy. |
| Coerced unlock | Duress passphrase → crypto‑erase. |
| Repeated guessing | Wipe‑after‑N crypto‑erase via tamper‑resistant counter. |
| Rooted/jailbroken extraction | DEK only in worker memory, zeroed on lock; never cache plaintext DEK outside the secure element. |
| Cloud/server breach | **No server exists** — zero remote attack surface. |
| Residual risk | Lost device + weak passphrase (no remote wipe). Mitigate: strong‑passphrase policy, short auto‑lock, biometric‑gated key. JS/Wasm memory zeroization is imperfect — minimize key lifetime, prefer overwritable typed arrays, unwrap inside the worker/Wasm boundary. |

---

## 12. Recommended Tech Stack

**One TypeScript codebase, web first, then Android → iOS with no rewrite.**

| Layer | Choice | Why |
|---|---|---|
| App shell | **Vite + React + TypeScript PWA**, wrapped with **Capacitor 7** for Android/iOS | Only option that is genuinely **web‑first by construction** — ship a real DOM PWA day one, `cap add android/ios` wraps the exact same `dist/`. Most mature web‑to‑native path in 2025, no second language. (Expo inverts the requirement to native‑first + RN‑Web; Tauri 2 mobile is least mature; Flutter is Dart, weak web — all rejected.) |
| UI | **Tailwind CSS + shadcn/ui (Radix)** | Renders identically on web and inside the Capacitor WebView; same components everywhere. |
| Storage | **Encrypted SQLite everywhere** — `wa-sqlite` + SQLite3 Multiple Ciphers (web, in a worker, OPFS) / `@capacitor-community/sqlite` + SQLCipher (mobile) | One relational schema + query layer; real whole‑file AES‑256 at rest; SQLCipher‑compatible format makes one encrypted export portable web↔mobile. |
| Settings/keys | `@capacitor/preferences` + Capacitor Vault / secure‑storage (Keychain/Keystore); WebAuthn PRF + Argon2id (libsodium) on web | Hardware‑backed key wrapping; passphrase fallback. |
| Notifications | `@capacitor/local-notifications` (mobile OS alarms) + Service‑Worker `showNotification()` best‑effort (web) | Real background alarms on mobile; honest best‑effort on web (no server ⇒ no web push). |
| Crypto | WebCrypto (AES‑256‑GCM) + libsodium‑wasm (Argon2id) | Standard, audited primitives; same on every target. |
| Landing page | Separate **static site (Astro or plain Vite/React) on Cloudflare Workers static assets** at **`<name>.dhanjit.me`** | Holds install/download links (direct APK, Play Store, TestFlight, App Store) + an "Add to Home Screen" PWA prompt for instant web install while native builds are in review. |

**Ship order:** PWA live on Cloudflare immediately → `cap add android` → Play Store / APK → `cap add ios` → TestFlight / App Store (iOS build/signing needs a Mac + $99/yr Apple account; Play Store one‑time $25).

**Standing‑infra alignment:** no provider lock‑in anywhere. If any optional LLM helper is added later (e.g., draft a supervisory note), route through **OpenRouter**, model behind an env var, no provider SDK hard‑wired — and keep any such feature **on‑device/offline‑capable or off by default**, since the data is confidential (local Ollama is the safer lane for sensitive text).

---

## 13. Risks, Open Questions & Assumptions

### 13.1 Legal — uncertain / verify before relying
- **Forensic 7yr+ visit (BNSS 176(3))** — mandatory **but** a State may defer up to **5 years** by notification. **Verify the officer's state rollout date** before treating non‑compliance as a hard bar; in the app, render it as a *trigger/checklist item*, not a day‑count deadline, with a "state‑rollout dependent" note.
- **Long‑pending buckets (3/6/12 months)** — **uncertain**; plausible and common but **not fixed by any central statute**, varies by State Police Manual. Label as **departmental practice**, make thresholds configurable.
- **Monthly crime conference / review cadences** — administrative (State Police Manual / PRB Reg. 54), **not BNSS**. Must not be cited as statutory in court.
- **Discharge 60‑day window (BNSS 250/262)** — uses "may"; Kerala HC treats it as **directory, not mandatory**. Don't present the right as strictly indefeasible.
- **State PSAs** (e.g., J&K PSA) — analogous but **distinct** clocks from NSA. **Verify the specific PSA** before relying; ship NSA defaults, allow PSA overrides.
- **Bail‑application disposal timeline** — **uncertain**; BNSS sets no hard day‑count. Track court‑fixed reply dates, don't invent a statutory clock.
- **"10 years or more" 60‑vs‑90 classification** — interpretive nuance (Karnataka/other HC, 2024–26): offences whose *minimum* is below 10 yrs may attract the 60‑day track. Exactly‑10‑years ⇒ 90‑day. Provide a **manual track override** and surface the punishment band so the officer decides.

### 13.2 Technical
- **iOS 64‑pending‑notification cap** — hard‑cap + prioritize by severity + proximity; re‑materialize a rolling 30‑day horizon each open or furthest alerts get dropped.
- **Android exact‑alarm revocation** restarts the app and **deletes** alarms — `checkExactNotificationSetting()` on startup and re‑materialize, or alarms vanish silently. OEM battery‑killers can still kill alarms.
- **Web background notifications are best‑effort only** — document in code as non‑load‑bearing so a future dev doesn't quietly make Periodic Background Sync the source of truth.
- **Cipher‑param drift** between web Wasm and native SQLCipher → silent restore failure. Pin params; add a CI round‑trip test (export on web, import on native, and vice‑versa).
- **WebAuthn PRF inconsistency on Safari/iOS** — never the only web unlock path; Argon2id passphrase fallback mandatory.
- **Time‑zone / date math** — compute legal day‑counts on **local calendar dates**, recompute on TZ change; off‑by‑one here hits the most consequential alerts.
- **JS/Wasm memory hygiene** — no guaranteed zeroization; minimize key lifetime, overwritable typed arrays, unwrap inside the worker/Wasm boundary.
- **Mac dependency for iOS** — unavoidable for any native iOS path.

### 13.3 Open questions for the user to confirm
1. Single device or two (phone + laptop)? If two, confirm the **manual offline encrypted export/import** is the accepted sync mechanism (no auto‑sync).
2. Default **auto‑lock timeout** (60s?) and **wipe‑after‑N** threshold (10?). Enable the **duress passphrase**?
3. Which **State** (and thus which **PSA** + manual‑based review cadences + forensic‑rollout status) should the app's defaults assume?
4. Scope of **preventive‑detention** tracking at launch — full NSA + PSA track, or NSA‑only first?
5. Any **LLM‑assist** desired (draft notes/summaries)? If yes, accept the local‑Ollama‑only constraint for confidential text.
6. Distribution: **direct APK + PWA** sufficient for v1, with Play Store / App Store later? (Avoids the Mac/store gating on day one.)

### 13.4 Assumptions
- Single user, single officer, one encrypted store; no multi‑user, no roles, no sharing.
- The officer owns the device and a strong passphrase; OS‑level device security is present but not relied upon.
- The app **assists supervision and memory**; it is **not** the official record (CCTNS remains the system of record) and not legal advice — statutory citations are convenience references, surfaced with their `verified?` status.
- Mobile is the strongly recommended primary surface for active deadline tracking; web is the desk‑review/backup surface.

---

## 14. Suggested App Name Options

Suitable for a `<name>.dhanjit.me` subdomain (short, professional, non‑alarming on a seized device):

1. **Nigah** (`nigah.dhanjit.me`) — Hindi/Urdu *nigah* = "watch / gaze / oversight"; captures the supervisory "keep an eye on every case" idea. Short, memorable, culturally apt.
2. **Pehra** (`pehra.dhanjit.me`) — *pehra* = "vigil / guard duty"; evokes the never‑forget watch over deadlines.
3. **CaseClock** (`caseclock.dhanjit.me`) — plain‑English, foregrounds the statutory‑clock core; instantly legible to any officer.
4. **Smriti** (`smriti.dhanjit.me`) — Sanskrit *smriti* = "memory / that which is remembered"; leans into the context‑continuity ("the system remembers for him") theme.

**Recommendation:** **Nigah** (primary) for connotation + brevity, with **CaseClock** as the descriptive fallback if a self‑explanatory name is preferred.
