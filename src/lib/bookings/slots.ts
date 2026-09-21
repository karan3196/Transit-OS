/**
 * Appointment slot arithmetic.
 *
 * Kept pure and free of database access so the conflict rules can be tested
 * directly — booking collisions are one of the four things CLAUDE.md section 7
 * says to test, because a double-booked chair costs the clinic real money.
 *
 * The database still has the last word: `bookings_no_overlap` in migration 0005
 * is a GiST exclusion constraint, so a race between the agent and the front
 * desk fails at insert time rather than producing two appointments.
 */

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** `{ mon: ['10:00', '20:00'] }`. A missing or empty day means closed. */
export type OpeningHours = Partial<Record<Weekday, [string, string] | string[]>>;

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotOptions {
  hours: OpeningHours;
  timezone: string;
  durationMinutes: number;
  /** Granularity of proposed start times. Defaults to the service duration. */
  stepMinutes?: number;
  /** Live bookings on the resource being checked. */
  busy?: Interval[];
  /** Nothing is offered before this instant. Defaults to now. */
  notBefore?: Date;
  /** Lead time the clinic needs before an appointment can start. */
  minNoticeMinutes?: number;
  maxSlots?: number;
}

function zoneOffsetMs(instant: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Converts a wall-clock time in `timezone` to the matching UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = naive - zoneOffsetMs(new Date(naive), timezone);
  const corrected = naive - zoneOffsetMs(new Date(firstGuess), timezone);
  return new Date(corrected);
}

/** Calendar date and weekday of an instant, as seen in `timezone`. */
export function zonedDateParts(instant: Date, timezone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: (parts.weekday ?? 'Sun').slice(0, 3).toLowerCase() as Weekday,
  };
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function parseHhMm(value: string): [number, number] | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59) return null;
  return [hour, minute];
}

/**
 * Proposes bookable start times over the next `days`, skipping closed days,
 * anything inside `busy`, and anything before the notice window.
 */
export function findAvailableSlots(options: SlotOptions, days = 7): Interval[] {
  const {
    hours,
    timezone,
    durationMinutes,
    stepMinutes = durationMinutes,
    busy = [],
    notBefore = new Date(),
    minNoticeMinutes = 60,
    maxSlots = 12,
  } = options;

  if (durationMinutes <= 0 || stepMinutes <= 0) return [];

  const earliest = new Date(notBefore.getTime() + minNoticeMinutes * 60_000);
  const slots: Interval[] = [];

  for (let dayOffset = 0; dayOffset < days && slots.length < maxSlots; dayOffset += 1) {
    const cursor = new Date(notBefore.getTime() + dayOffset * 86_400_000);
    const { year, month, day, weekday } = zonedDateParts(cursor, timezone);

    const window = hours[weekday];
    if (!window || window.length < 2) continue;

    const open = parseHhMm(String(window[0]));
    const close = parseHhMm(String(window[1]));
    if (!open || !close) continue;

    const dayOpen = zonedTimeToUtc(year, month, day, open[0], open[1], timezone);
    const dayClose = zonedTimeToUtc(year, month, day, close[0], close[1], timezone);

    for (
      let start = dayOpen.getTime();
      start + durationMinutes * 60_000 <= dayClose.getTime();
      start += stepMinutes * 60_000
    ) {
      if (slots.length >= maxSlots) break;

      const candidate: Interval = {
        start: new Date(start),
        end: new Date(start + durationMinutes * 60_000),
      };

      if (candidate.start < earliest) continue;
      if (busy.some((b) => overlaps(candidate, b))) continue;

      slots.push(candidate);
    }
  }

  return slots;
}

/** True when a proposed appointment collides with an existing one. */
export function hasConflict(candidate: Interval, busy: Interval[]): boolean {
  return busy.some((b) => overlaps(candidate, b));
}

export function weekdayOf(instant: Date, timezone: string): Weekday {
  return zonedDateParts(instant, timezone).weekday;
}

export function summariseHours(hours: OpeningHours): string {
  const parts: string[] = [];
  for (const day of WEEKDAYS) {
    const window = hours[day];
    if (!window || window.length < 2) continue;
    parts.push(`${day[0]!.toUpperCase()}${day.slice(1)} ${window[0]}–${window[1]}`);
  }
  return parts.join(', ') || 'Hours not configured';
}
