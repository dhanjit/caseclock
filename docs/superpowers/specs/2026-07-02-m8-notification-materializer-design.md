# M8 (Lean) — OS-notification materializer — design

> Status: approved (2026-07-02). Scope chosen: **Lean M8** — materialize + schedule +
> tap-to-open, native-only, no persistent snooze/ack (deferred until an `alert_state`
> table lands, which is the unbuilt half of M6).

## Why lean

`alert_state` does not exist and snooze/ack is implemented nowhere (grep-verified). But
the two invariants that matter are already satisfied structurally:

- **"Statutory OVERDUE never silently clears"** — OVERDUE is *derived* from dates by the
  rules engine on every app open, not a stored flag, so it cannot be lost.
- **Handled items stop notifying** — a filed chargesheet flips the deadline to `state=done`,
  which `bucketFor()` drops from the agenda, so no notification is materialized.

The only thing `alert_state` would add to M8 is *snooze* (temporarily quiet an alert) and a
persisted *acknowledged* flag — refinements, not the core alarm. So the core value ("the
alarm fires on the due date while the app is closed") ships now with no schema change.

## Architecture (mirrors the existing `VaultStore` seam)

```
src/rules/notifications.ts     PURE — the brain, fully unit-testable in Node
  materializeNotifications(agenda, today, opts) → { scheduled, droppedForCap }

src/notify/notification-sink.ts  the platform seam
  interface NotificationSink { requestPermission(); schedule(list); cancelAll(); }
  · noopNotificationSink        → web / tests (records calls)
  · capacitorNotificationSink   → @capacitor/local-notifications (thin adapter)

src/notify/index.ts            selectNotificationSink() = isNativePlatform() ? capacitor : noop
src/notify/sync.ts             syncNotifications(agenda, sink, today, opts):
                                 sink.cancelAll() → sink.schedule(materialize(...).scheduled)
```

Wired into the cases store: after `load()` (app open) and after any mutation, fire-and-forget
`syncNotifications`. On web the sink is a no-op (agenda remains system-of-record).

## Materialization policy

Input is the already-bucketed `Agenda` (horizon 30) from `buildAgenda()`. For each item:

- **overdue bucket** → a **bounded daily run**: fire on `today+1 .. today+overdueRunDays`
  (default 14). Today is skipped because the app is open now.
- **today / upcoming bucket** (has `dueAt = D`, `leadOffsets`) → candidate fire dates =
  `{ D } ∪ { D − o for o in leadOffsets }`, filtered to the window `[today+1, today+horizon]`.
  (Strictly future: a fire date of `today` is pointless — the officer is in the app.)

Then across all candidates:

1. **Exclude `silent` items** — non-priority overdue items alert in-app only (the priority
   model: only the ~10 priority cases get interruptive OS alarms). Reduces noise + cap pressure.
2. **Stable integer id** — `fnv1a("caseId|ruleId|occurrenceDate|fireAt") & 0x7fffffff`
   (positive 31-bit; Capacitor/Android ids are 32-bit ints). Same logical alarm ⇒ same id ⇒
   idempotent reschedule.
3. **iOS 64-cap** — sort by `(severityRank, fireAt asc)`, take first `maxScheduled` (default 64),
   and **return `droppedForCap`** (count of candidates that exceeded the cap). No silent truncation.

`ScheduledNotification.fireAt` is a calendar date (`ISODate`); the sink applies the time-of-day
(default **09:00 local**) when converting to a `Date` for the plugin.

## Defaults

| Knob | Default |
|---|---|
| `horizonDays` | 30 |
| `overdueRunDays` | 14 |
| `maxScheduled` | 64 (iOS pending limit) |
| fire time-of-day | 09:00 local (applied in the sink) |
| lead offsets | per-rule `DeadlineEvent.leadOffsets` |

## Out of scope (deferred to when `alert_state` lands)

- Notification-action **Snooze / Acknowledge** buttons + write-back.
- `os_notification_ids` persistence and the reconcile-migration of alert state.
- Android exact-alarm permission handling (this app targets iPad first).

## Tap-to-open

Each notification carries `extra = { caseId, ruleId, occurrenceDate }`. The Capacitor sink
registers a `localNotificationActionPerformed` listener that routes `extra.caseId` to the case
detail view. (Listener registration is native glue, validated in the on-device gate test.)

## Test plan (TDD, pure materializer carries the logic)

- due-day + each lead-offset within the horizon each produce one notification; past/`>horizon`
  fire dates excluded; `today` fire dates excluded (strictly future).
- overdue item → exactly `overdueRunDays` daily notifications starting `today+1`.
- `done` / `na` / `extinguished` items never appear (they are not in the agenda).
- `silent` (non-priority overdue) items excluded.
- 64-cap: given >64 candidates, exactly 64 returned, highest-severity/soonest kept,
  `droppedForCap` = remainder.
- stable ids: same inputs ⇒ same id; different fire date ⇒ different id.
- empty agenda ⇒ empty result, `droppedForCap = 0`.
- sink: `syncNotifications` calls `cancelAll` then `schedule` with the materialized list;
  `noop` sink records calls; web path schedules nothing interruptive.
