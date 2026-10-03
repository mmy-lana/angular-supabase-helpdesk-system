import { Pipe, PipeTransform } from '@angular/core';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Beyond this distance a relative label stops carrying information. */
const RECENT_WINDOW = 5 * WEEK;

/** Below this distance two timestamps read as simultaneous to a person. */
const JUST_NOW_WINDOW = 45_000;

const absoluteDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

/**
 * Relative timestamp formatting ("5m ago", "2h ago", "3d ago").
 *
 * Ticket lists re-render on every realtime tick, and formatting the same minute
 * over and over is the hot path, so results are memoised per input value and
 * per elapsed minute. The cache is dropped wholesale once it grows past a few
 * hundred entries, which keeps memory flat in a long lived workspace tab.
 */
@Pipe({ name: 'timeAgo', pure: true })
export class TimeAgoPipe implements PipeTransform {
  private static readonly cache = new Map<string, string>();
  private static readonly cacheLimit = 512;

  transform(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }

    const timestamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return '';
    }

    const key = `${timestamp}:${Math.floor(Date.now() / MINUTE)}`;
    const cached = TimeAgoPipe.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const formatted = TimeAgoPipe.format(timestamp);
    if (TimeAgoPipe.cache.size >= TimeAgoPipe.cacheLimit) {
      TimeAgoPipe.cache.clear();
    }
    TimeAgoPipe.cache.set(key, formatted);
    return formatted;
  }

  private static format(timestamp: number): string {
    const elapsed = Date.now() - timestamp;

    if (elapsed < 0) {
      return `in ${TimeAgoPipe.compact(-elapsed)}`;
    }
    if (elapsed < JUST_NOW_WINDOW) {
      return 'just now';
    }
    if (elapsed < RECENT_WINDOW) {
      return `${TimeAgoPipe.compact(elapsed)} ago`;
    }
    return absoluteDate.format(new Date(timestamp));
  }

  private static compact(elapsed: number): string {
    if (elapsed < HOUR) {
      return `${Math.max(1, Math.floor(elapsed / MINUTE))}m`;
    }
    if (elapsed < DAY) {
      return `${Math.floor(elapsed / HOUR)}h`;
    }
    if (elapsed < WEEK) {
      return `${Math.floor(elapsed / DAY)}d`;
    }
    return `${Math.floor(elapsed / WEEK)}w`;
  }
}