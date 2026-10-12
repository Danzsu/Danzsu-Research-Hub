// The day's Top 10 (daily news spec N4), framework-free so node --test runs it.

const budapestDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" });

/** The day a run belongs to, as Budapest sees it ("2026-10-12"): a late manual run stays on its own evening. */
export const budapestDay = (now: Date) => budapestDate.format(now);

const HOUR = 3_600_000;

/** Budapest's midnight as an instant: 22:00 UTC the evening before in summer (UTC+2), 23:00 in winter (UTC+1). */
export function budapestDayStart(now: Date): Date {
  const day = budapestDay(now);
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // The earlier candidate that already reads as `day` in Budapest is its midnight.
  const start = [2, 1].map((hours) => utcMidnight - hours * HOUR).find((instant) => budapestDay(new Date(instant)) === day);
  return new Date(start ?? utcMidnight);
}

export const DAILY_SIZE = 10;
export const SHORT_MINUTES = 15;
const MIN_SHORT = 3;
const MAX_SHORT = 5;

export type DailyCandidate = { id: string; score: number; read_minutes: number };

/**
 * The ten best by score, with 3–5 short reads (≤ 15 minutes) whenever the day has them: the lowest-scored of
 * the other kind make room for the best of the wanted kind. Ties keep the given order (the model's answer).
 */
export function pickDailyTop<T extends DailyCandidate>(items: T[]): T[] {
  const order = new Map(items.map((entry, index) => [entry, index]));
  const byScore = (a: T, b: T) => b.score - a.score || order.get(a)! - order.get(b)!;
  const ranked = [...items].sort(byScore);
  const top = ranked.slice(0, DAILY_SIZE);
  const rest = ranked.slice(DAILY_SIZE);
  const isShort = (entry: T) => entry.read_minutes <= SHORT_MINUTES;
  const shortCount = () => top.filter(isShort).length;
  const swapIn = (wantShort: boolean) => {
    const out = top.findLastIndex((entry) => isShort(entry) !== wantShort);
    const into = rest.findIndex((entry) => isShort(entry) === wantShort);
    if (out === -1 || into === -1) return false;
    [top[out], rest[into]] = [rest[into], top[out]];
    return true;
  };
  while (shortCount() < MIN_SHORT && swapIn(true));
  while (shortCount() > MAX_SHORT && swapIn(false));
  return top.sort(byScore);
}
