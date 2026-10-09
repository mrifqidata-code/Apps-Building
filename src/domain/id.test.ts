import { describe, expect, it } from 'vitest';
import { encodeUuidv7, isUuid, uuidv7, uuidv7Timestamp } from './id';

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 UUIDs', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it('encodes the creation time so ids sort by time', () => {
    // Far-future times so earlier calls in this file cannot be ahead of them.
    const earlier = uuidv7(2_000_000_000_000);
    const later = uuidv7(2_000_000_000_001);
    expect(uuidv7Timestamp(earlier)).toBe(2_000_000_000_000);
    expect(uuidv7Timestamp(later)).toBe(2_000_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it('keeps creation order for ids made in the same millisecond', () => {
    const ids = Array.from({ length: 1_000 }, () => uuidv7(2_100_000_000_000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps counting when the clock moves backwards', () => {
    const first = uuidv7(2_200_000_000_000);
    const second = uuidv7(2_199_999_999_000);
    expect(second > first).toBe(true);
  });

  it('places time and random bits at the right positions', () => {
    expect(encodeUuidv7(0, (1n << 74n) - 1n)).toBe('00000000-0000-7fff-bfff-ffffffffffff');
    expect(encodeUuidv7(1, 0n)).toBe('00000000-0001-7000-8000-000000000000');
  });

  it('does not repeat across many calls', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()));
    expect(ids.size).toBe(10_000);
  });
});
