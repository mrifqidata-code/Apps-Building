import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7, uuidv7Timestamp } from './id';

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 UUIDs', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it('encodes the creation time so ids sort by time', () => {
    const earlier = uuidv7(1_791_000_000_000);
    const later = uuidv7(1_791_000_000_001);
    expect(uuidv7Timestamp(earlier)).toBe(1_791_000_000_000);
    expect(earlier < later).toBe(true);
  });

  it('is deterministic for a given time and randomness', () => {
    const random = new Uint8Array(10).fill(0xff);
    expect(uuidv7(0, random)).toBe('00000000-0000-7fff-bfff-ffffffffffff');
  });

  it('does not repeat across many calls', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()));
    expect(ids.size).toBe(10_000);
  });
});
