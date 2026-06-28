/**
 * Calendar-date arithmetic for statutory clocks (PLAN §1 dates row, §7).
 *
 * Legal day-counts are LOCAL CALENDAR dates, never UTC instants — an off-by-one
 * here hits the most consequential alerts (default bail). We represent dates as
 * 'YYYY-MM-DD' strings and do arithmetic on a UTC-anchored Date (noon-free, so
 * DST can never shift a day). `today` is always passed in by callers, so the
 * rule functions stay pure and golden-testable.
 */

export type ISODate = string; // 'YYYY-MM-DD'

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parse(d: ISODate): Date {
  // Date-only by contract: strip any time suffix so a stray datetime ('…T22:10Z')
  // truncates to its calendar date instead of producing an Invalid Date.
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function format(dt: Date): ISODate {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Today's LOCAL calendar date (app-side; tests pass an explicit `today`). */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = parse(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return format(dt);
}

/** Add months, clamping to the last day of the target month (Jan 31 + 1mo → Feb 28/29). */
export function addMonths(d: ISODate, n: number): ISODate {
  const dt = parse(d);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, lastDay));
  return format(dt);
}

/** Whole days from `b` to `a` (a − b). Positive if `a` is later. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
}

export function isWeekend(d: ISODate): boolean {
  const day = parse(d).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Add N *working* days (skip weekends + the holiday set). Used for the s.45
 * sanction clocks (7 working days each). Holidays are 'YYYY-MM-DD' strings.
 */
export function addWorkingDays(d: ISODate, n: number, holidays: ReadonlySet<string> = new Set()): ISODate {
  let cur = d;
  let added = 0;
  while (added < n) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur) && !holidays.has(cur)) added++;
  }
  return cur;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return diffDays(a, b) >= 0 ? a : b;
}

/** Inclusive list of YYYY-MM from startYM through endYM (capped at 600 months). */
export function monthsBetween(startYM: string, endYM: string): string[] {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  if (sy > ey || (sy === ey && sm > em)) return [endYM];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
