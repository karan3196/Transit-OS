import { describe, expect, it } from 'vitest';
import {
  findAvailableSlots,
  hasConflict,
  overlaps,
  summariseHours,
  weekdayOf,
  zonedTimeToUtc,
  type OpeningHours,
} from '@/lib/bookings/slots';

const IST = 'Asia/Kolkata';

const HOURS: OpeningHours = {
  mon: ['10:00', '20:00'],
  tue: ['10:00', '20:00'],
  wed: ['10:00', '20:00'],
  thu: ['10:00', '20:00'],
  fri: ['10:00', '20:00'],
  sat: ['10:00', '20:00'],
  sun: ['11:00', '17:00'],
};

// A Monday, 09:00 IST.
const MONDAY_0900_IST = zonedTimeToUtc(2026, 9, 21, 9, 0, IST);

describe('timezone handling', () => {
  it('maps a wall-clock IST time to the right UTC instant', () => {
    expect(zonedTimeToUtc(2026, 9, 21, 10, 0, IST).toISOString()).toBe('2026-09-21T04:30:00.000Z');
  });

  it('reports the weekday as seen in the tenant timezone, not UTC', () => {
    // 23:30 UTC on Sunday is already Monday 05:00 in Kolkata.
    expect(weekdayOf(new Date('2026-09-20T23:30:00.000Z'), IST)).toBe('mon');
    expect(weekdayOf(new Date('2026-09-20T23:30:00.000Z'), 'UTC')).toBe('sun');
  });
});

describe('interval overlap', () => {
  const at = (h: number, m = 0) => zonedTimeToUtc(2026, 9, 21, h, m, IST);

  it('treats touching intervals as non-overlapping', () => {
    expect(
      overlaps({ start: at(10), end: at(11) }, { start: at(11), end: at(12) }),
    ).toBe(false);
  });

  it('detects partial, full and identical overlaps', () => {
    expect(overlaps({ start: at(10), end: at(11) }, { start: at(10, 30), end: at(12) })).toBe(true);
    expect(overlaps({ start: at(10), end: at(13) }, { start: at(11), end: at(12) })).toBe(true);
    expect(overlaps({ start: at(10), end: at(11) }, { start: at(10), end: at(11) })).toBe(true);
  });
});

describe('slot search', () => {
  it('offers nothing before the notice window', () => {
    const slots = findAvailableSlots({
      hours: HOURS,
      timezone: IST,
      durationMinutes: 30,
      notBefore: MONDAY_0900_IST,
      minNoticeMinutes: 120,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.start.getTime()).toBeGreaterThanOrEqual(
      MONDAY_0900_IST.getTime() + 120 * 60_000,
    );
  });

  it('stays inside opening hours and never runs past closing', () => {
    const slots = findAvailableSlots(
      { hours: HOURS, timezone: IST, durationMinutes: 60, notBefore: MONDAY_0900_IST, maxSlots: 40 },
      2,
    );

    for (const slot of slots) {
      const openAt = zonedTimeToUtc(
        ...(dateParts(slot.start) as [number, number, number]),
        10,
        0,
        IST,
      );
      const closeAt = zonedTimeToUtc(
        ...(dateParts(slot.start) as [number, number, number]),
        20,
        0,
        IST,
      );
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(openAt.getTime());
      expect(slot.end.getTime()).toBeLessThanOrEqual(closeAt.getTime());
    }
  });

  it("honours Sunday's shorter hours", () => {
    // Sunday 20 Sep 2026, searching one day only.
    const sunday = zonedTimeToUtc(2026, 9, 20, 8, 0, IST);
    const slots = findAvailableSlots(
      { hours: HOURS, timezone: IST, durationMinutes: 60, notBefore: sunday, maxSlots: 40 },
      1,
    );

    expect(slots.length).toBeGreaterThan(0);
    const last = slots.at(-1)!;
    expect(last.end.getTime()).toBeLessThanOrEqual(zonedTimeToUtc(2026, 9, 20, 17, 0, IST).getTime());
  });

  it('skips a closed day entirely', () => {
    const slots = findAvailableSlots(
      {
        hours: { ...HOURS, mon: [] },
        timezone: IST,
        durationMinutes: 30,
        notBefore: MONDAY_0900_IST,
        maxSlots: 40,
      },
      1,
    );
    expect(slots).toHaveLength(0);
  });

  it('never proposes a slot that collides with an existing booking', () => {
    const busy = [
      {
        start: zonedTimeToUtc(2026, 9, 21, 11, 0, IST),
        end: zonedTimeToUtc(2026, 9, 21, 12, 0, IST),
      },
    ];

    const slots = findAvailableSlots(
      {
        hours: HOURS,
        timezone: IST,
        durationMinutes: 30,
        notBefore: MONDAY_0900_IST,
        minNoticeMinutes: 0,
        busy,
        maxSlots: 40,
      },
      1,
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(hasConflict(slot, busy), slot.start.toISOString()).toBe(false);
    }
    // The 11:00 and 11:30 starts are gone, 12:00 is back.
    const starts = slots.map((s) => s.start.toISOString());
    expect(starts).not.toContain(zonedTimeToUtc(2026, 9, 21, 11, 0, IST).toISOString());
    expect(starts).not.toContain(zonedTimeToUtc(2026, 9, 21, 11, 30, IST).toISOString());
    expect(starts).toContain(zonedTimeToUtc(2026, 9, 21, 12, 0, IST).toISOString());
  });

  it('returns nothing for a nonsensical duration instead of looping', () => {
    expect(
      findAvailableSlots({ hours: HOURS, timezone: IST, durationMinutes: 0, notBefore: MONDAY_0900_IST }),
    ).toHaveLength(0);
  });
});

describe('hours summary', () => {
  it('renders configured days and skips closed ones', () => {
    expect(summariseHours({ mon: ['10:00', '20:00'], sun: [] })).toBe('Mon 10:00–20:00');
    expect(summariseHours({})).toBe('Hours not configured');
  });
});

function dateParts(instant: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return [get('year'), get('month'), get('day')];
}
