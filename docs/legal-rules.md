# legal-rules.md — the rule registry, in human terms

> Frozen source for every deadline rule in `src/rules/engine.ts`. The exact law
> references here are asserted against the registry by `engine.test.ts`
> (doc-sync), so a wrong-but-present clause fails CI. Day-counts and verified
> status come from the adversarially fact-checked table in [RESEARCH.md §5](RESEARCH.md).
>
> **Verified** — `confirmed` matches current law · `corrected` was fixed during
> verification · `uncertain` ⇒ surfaced with "verify before relying", never a hard bar.

| rule_id | Clock | Anchor → due | Law ref | Severity | Verified |
|---|---|---|---|---|---|
| `efir-3day` | e-FIR signature by informant | FIR date + 3 days | BNSS **173(1)(ii)** | statutory | corrected |
| `production-24h` | Production before magistrate | arrest + 24h (excl. journey; in person) | BNSS 58 + 187(1); Art. 22(2) | statutory-critical | confirmed |
| `chargesheet-ceiling` | Chargesheet 60/90 (non-UAPA) | **first remand** + 60/90 | BNSS 187(3) | statutory-critical | confirmed |
| `default-bail` | Default bail (non-UAPA, state machine) | **first remand** + 60/90 | BNSS 187(3) | statutory-critical | corrected |
| `uapa-chargesheet-ceiling` | UAPA chargesheet 90/180 | first remand + 90 (or 180 if extended) | UAPA 43-D(2)(b) r/w BNSS 187(3) | statutory-critical | confirmed |
| `uapa-default-bail` | UAPA default bail (state machine) | first remand + 90/180 | UAPA 43-D(2)(b) proviso | statutory-critical | corrected |
| `uapa-pp-report-window` | PP progress report **before day 90** (owed by **PP**) | first remand + 90 (hard boundary) | UAPA 43-D(2)(b) proviso | statutory-critical | confirmed |
| `pc-window` | Police-custody window (non-UAPA) | first remand + 40/60 | BNSS 187(2)/(3) | statutory | confirmed |
| `sanction-rule3` | Sanction — Authority recommendation | evidence-to-Authority + **7 working days** | UAP (Recommendation & Sanction) Rules 2008, Rule 3 + s.45(2) | statutory-critical | confirmed |
| `sanction-rule4` | Sanction — Government decision | Rule-3 recommendation + **7 working days** | UAP … Rules 2008, Rule 4 + s.45(2) | statutory-critical | confirmed |
| `victim-90` | Victim progress update | FIR date + 90 | BNSS **193(3)(ii)** | statutory | confirmed |
| `doc-supply-14` | Supply of documents to accused | first appearance + 14 | BNSS 230 | statutory | confirmed |
| `committal-90` | Committal to Sessions | cognizance + 90 | BNSS 232 | statutory | confirmed |
| `discharge-60` | Discharge application window | committal + 60 | BNSS 250(1) | directory | **uncertain** (directory, Kerala HC) |
| `judgment-30` | Judgment after arguments | arguments concluded + 30 (max 45) | BNSS 258 / 392 | statutory | confirmed |
| `sexual-offence-invest-2mo` | Sexual-offence investigation | FIR date + 2 months | BNSS 193(2)/(3) | directory | corrected (BNS 64-68/70/71 + POCSO 4/6/8/10; **s.69 excluded**) |
| `sexual-offence-trial-2mo` | Sexual-offence trial | chargesheet + 2 months | BNSS 346 proviso | directory | confirmed |
| `s479-undertrial-release` | Undertrial release (1/3 first-timer · 1/2 general) | first remand + fraction of max sentence | BNSS 479 | statutory | confirmed |
| `appeal-conviction-magistrate-30` | Appeal to Sessions | judgment + 30 | BNSS 415(3) + Limitation Act Art. 115(b)(ii) | statutory-condonable | confirmed |
| `appeal-conviction-sessions-60` | Appeal to High Court | judgment + 60 | BNSS 415(2) + Limitation Act Art. 115(b)(i) | statutory-condonable | confirmed |
| `appeal-conviction-sessions-death-30` | Death-sentence appeal (inverts to 30) | judgment + 30 | Limitation Act Art. 115(a) | statutory-condonable | confirmed |
| `appeal-acquittal-hc-90` | Appeal against acquittal (HC) | judgment + 90 | BNSS 419 + Limitation Act Art. 114 | statutory-condonable | confirmed |
| `appeal-acquittal-sessions-30` | Appeal against acquittal (Sessions) | judgment + 30 | BNSS 419 + Limitation Act Art. 114 | statutory-condonable | confirmed |
| `bail-hearing-prep` | Bail hearing prep | hearing date − 5/3/1 | BNSS Ch. XXXV | court | confirmed |
| `court-hearing-prep` | Court hearing prep | hearing date − 10/7/3 | — | court | confirmed |
| `review-overdue` | Supervisory review due | next-review date | — (departmental cadence) | soft | uncertain |
| `untouched` | Case untouched N days | last-touched + N (default 14) | — (supervisory staleness) | soft | uncertain |

**Mutual exclusivity:** `uapa-*` rules apply only when `uapaFlag` is set; `chargesheet-ceiling`/`default-bail`/`pc-window` apply only when it is **not**. A UAPA case therefore yields exactly one chargesheet ceiling + one default-bail row, sourced from the UAPA track.

**Default bail is a state machine**, not a countdown: `active` (clock running) → `window-open` (period elapsed, no chargesheet — claimable by the accused) vs `extinguished` (chargesheet filed within the period). Day-of-ceiling is still `active` (last day to file); claimable the day after.

**Deferred (v1 OUT):** NSA/PSA preventive-detention clocks, UAPA 30-day PC cap, mercy-petition, forensic-7yr+ as a checklist trigger. See [PLAN.md §0](PLAN.md).
