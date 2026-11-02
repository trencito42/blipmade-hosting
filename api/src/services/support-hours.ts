import { z } from 'zod';

/**
 * Business hours, for the clocks of the answer times.
 *
 * The hours are written by the operator: a time zone, the windows of each weekday and the days that are closed. Without
 * hours, time counts around the clock for the clocks. This is only arithmetic for the clocks: whether a person is here to
 * answer a chat is read from the presence of the staff, never from these hours.
 */

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time is written 09:00.');
const windowSchema = z.object({ from: time, to: time }).refine((w) => w.from < w.to, 'A window ends after it starts.');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const hoursSchema = z.object({
  timezone: z.string().refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone.'),
  days: z.object(Object.fromEntries(DAYS.map((day) => [day, z.array(windowSchema).max(4).default([])])) as Record<(typeof DAYS)[number], z.ZodDefault<z.ZodArray<typeof windowSchema>>>),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400).default([]),
});

export type Hours = z.infer<typeof hoursSchema>;

/** The offset of a zone from UTC at an instant, in minutes. */
export function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** A wall clock time of a zone as an instant. */
function zoned(year: number, month: number, day: number, minutes: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  let result = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  result = guess - offsetMinutes(new Date(result), timeZone) * 60_000;
  return new Date(result);
}

function localDate(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const pad = (n: number) => String(n).padStart(2, '0');

/** The windows of one local day, as instants. */
function windowsOf(hours: Hours, year: number, month: number, day: number): { start: Date; end: Date }[] {
  if (hours.holidays.includes(`${year}-${pad(month)}-${pad(day)}`)) return [];
  const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
  return hours.days[weekday].map((window) => ({ start: zoned(year, month, day, minutesOf(window.from), hours.timezone), end: zoned(year, month, day, minutesOf(window.to), hours.timezone) }));
}

/** Whether the hours are open at an instant. Without hours it is always open. */
export function isOpenAt(hours: Hours | null, at: Date): boolean {
  if (!hours) return true;
  const { year, month, day } = localDate(at, hours.timezone);
  return windowsOf(hours, year, month, day).some((window) => at >= window.start && at < window.end);
}

/** The minutes of business time between two instants. Without hours, all the minutes. */
export function businessMinutesBetween(hours: Hours | null, from: Date, to: Date): number {
  if (to <= from) return 0;
  if (!hours) return Math.floor((to.getTime() - from.getTime()) / 60_000);
  let total = 0;
  const first = localDate(from, hours.timezone);
  let cursor = new Date(Date.UTC(first.year, first.month - 1, first.day));
  for (let guard = 0; guard < 800; guard++) {
    const windows = windowsOf(hours, cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
    for (const window of windows) {
      const start = window.start > from ? window.start : from;
      const end = window.end < to ? window.end : to;
      if (end > start) total += (end.getTime() - start.getTime()) / 60_000;
    }
    if (windows.length && windows.at(-1)!.end >= to) break;
    cursor = new Date(cursor.getTime() + 86_400_000);
    if (zoned(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), 0, hours.timezone) > to) break;
  }
  return Math.floor(total);
}

/** The instant at which a number of business minutes have passed since a start. Without hours, plain minutes. */
export function addBusinessMinutes(hours: Hours | null, from: Date, minutes: number): Date {
  if (!hours) return new Date(from.getTime() + minutes * 60_000);
  let left = minutes;
  const first = localDate(from, hours.timezone);
  let cursor = new Date(Date.UTC(first.year, first.month - 1, first.day));
  for (let guard = 0; guard < 800; guard++) {
    for (const window of windowsOf(hours, cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())) {
      const start = window.start > from ? window.start : from;
      if (window.end <= start) continue;
      const room = (window.end.getTime() - start.getTime()) / 60_000;
      if (left <= room) return new Date(start.getTime() + left * 60_000);
      left -= room;
    }
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  // Hours with no open window at all: the clock cannot run, so it never expires inside the horizon.
  return new Date(from.getTime() + 800 * 86_400_000);
}
