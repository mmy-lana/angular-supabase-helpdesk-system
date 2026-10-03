import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeAgoPipe } from './time-ago.pipe';

describe('TimeAgoPipe', () => {
  const pipe = new TimeAgoPipe();
  let now: number;

  beforeEach(() => {
    now = Date.parse('2026-03-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty string for missing or unparsable input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('not-a-date')).toBe('');
  });

  it('collapses timestamps that are indistinguishable from now', () => {
    expect(pipe.transform(new Date(now))).toBe('just now');
    expect(pipe.transform(new Date(now - 30_000).toISOString())).toBe('just now');
  });

  it('formats minutes, hours, days and weeks', () => {
    expect(pipe.transform(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(pipe.transform(new Date(now - 2 * 3_600_000).toISOString())).toBe('2h ago');
    expect(pipe.transform(new Date(now - 3 * 86_400_000).toISOString())).toBe('3d ago');
    expect(pipe.transform(new Date(now - 14 * 86_400_000).toISOString())).toBe('2w ago');
  });

  it('falls back to an absolute date once relative wording stops helping', () => {
    expect(pipe.transform(new Date(now - 90 * 86_400_000).toISOString())).toBe('18 Dec 2025');
  });

  it('describes clock skew instead of rendering a negative age', () => {
    expect(pipe.transform(new Date(now + 12 * 60_000).toISOString())).toBe('in 12m');
  });

  it('accepts Date and epoch millisecond input', () => {
    expect(pipe.transform(new Date(now - 7 * 60_000))).toBe('7m ago');
    expect(pipe.transform(now - 7 * 60_000)).toBe('7m ago');
  });
});