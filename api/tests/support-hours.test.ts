import { describe, expect, it } from 'vitest';
import { addBusinessMinutes, businessMinutesBetween, hoursSchema, isOpenAt, offsetMinutes, type Hours } from '../src/services/support-hours.js';

const weekdays = [{ from: '09:00', to: '17:00' }];
const hours: Hours = hoursSchema.parse({
  timezone: 'Europe/Bucharest',
  days: { mon: weekdays, tue: weekdays, wed: weekdays, thu: weekdays, fri: weekdays },
  holidays: ['2026-11-30'],
});

// Bucharest is UTC+2 in November (winter time), so 09:00 there is 07:00 UTC.
const at = (iso: string) => new Date(iso);

describe('business hours', () => {
  it('knows the offset of a zone, with the summer time', () => {
    expect(offsetMinutes(at('2026-11-02T12:00:00Z'), 'Europe/Bucharest')).toBe(120);
    expect(offsetMinutes(at('2026-07-02T12:00:00Z'), 'Europe/Bucharest')).toBe(180);
  });

  it('is open inside a window of a weekday and closed outside, on weekends and on a holiday', () => {
    expect(isOpenAt(hours, at('2026-11-02T08:00:00Z'))).toBe(true); // Monday 10:00 local
    expect(isOpenAt(hours, at('2026-11-02T05:00:00Z'))).toBe(false); // 07:00 local
    expect(isOpenAt(hours, at('2026-11-02T15:30:00Z'))).toBe(false); // 17:30 local
    expect(isOpenAt(hours, at('2026-11-07T10:00:00Z'))).toBe(false); // Saturday
    expect(isOpenAt(hours, at('2026-11-30T10:00:00Z'))).toBe(false); // holiday Monday
  });

  it('counts only the minutes inside the windows', () => {
    // Monday 16:00 local (14:00Z) to Tuesday 10:00 local (08:00Z): 60 minutes on Monday, 60 on Tuesday.
    expect(businessMinutesBetween(hours, at('2026-11-02T14:00:00Z'), at('2026-11-03T08:00:00Z'))).toBe(120);
    // The whole weekend counts for nothing.
    expect(businessMinutesBetween(hours, at('2026-11-06T14:00:00Z'), at('2026-11-09T08:00:00Z'))).toBe(120);
  });

  it('adds business minutes across the night and the weekend', () => {
    // 60 minutes left on Friday, then 30 on Monday morning: Monday 09:30 local = 07:30Z.
    expect(addBusinessMinutes(hours, at('2026-11-06T14:00:00Z'), 90).toISOString()).toBe('2026-11-09T07:30:00.000Z');
  });

  it('skips a holiday', () => {
    // Friday 16:00 local, 120 minutes: 60 on Friday, the Monday is a holiday, so 60 more on Tuesday 09:00 -> 10:00 local.
    expect(addBusinessMinutes(hours, at('2026-11-27T14:00:00Z'), 120).toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });

  it('runs around the clock without hours', () => {
    expect(isOpenAt(null, at('2026-11-07T03:00:00Z'))).toBe(true);
    expect(businessMinutesBetween(null, at('2026-11-07T03:00:00Z'), at('2026-11-07T04:00:00Z'))).toBe(60);
    expect(addBusinessMinutes(null, at('2026-11-07T03:00:00Z'), 30).toISOString()).toBe('2026-11-07T03:30:00.000Z');
  });

  it('refuses an unknown zone and a window that ends before it starts', () => {
    expect(hoursSchema.safeParse({ timezone: 'Mars/Base', days: {}, holidays: [] }).success).toBe(false);
    expect(hoursSchema.safeParse({ timezone: 'UTC', days: { mon: [{ from: '17:00', to: '09:00' }] }, holidays: [] }).success).toBe(false);
  });
});
