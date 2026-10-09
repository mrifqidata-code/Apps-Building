import { describe, expect, it } from 'vitest';
import {
  MAX_PIN_ATTEMPTS,
  NO_ATTEMPTS,
  PIN_LOCK_MS,
  hashPin,
  isValidPin,
  lockRemainingMs,
  registerPinFailure,
  verifyPin,
} from './pin';

describe('PIN format', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin(' 1234')).toBe(false);
  });
});

describe('hashPin / verifyPin', () => {
  it('verifies the right PIN and rejects a wrong one', async () => {
    const { hash, salt } = await hashPin('2580');
    expect(await verifyPin('2580', hash, salt)).toBe(true);
    expect(await verifyPin('2581', hash, salt)).toBe(false);
    expect(await verifyPin('abcd', hash, salt)).toBe(false);
  });

  it('never stores the PIN itself and salts every hash', async () => {
    const first = await hashPin('2580');
    const second = await hashPin('2580');
    expect(first.hash).not.toContain('2580');
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('refuses to hash an invalid PIN', async () => {
    await expect(hashPin('12')).rejects.toThrow(RangeError);
  });
});

describe('PIN lockout', () => {
  it('locks for a minute after five wrong PINs in a row', () => {
    let state = NO_ATTEMPTS;
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      state = registerPinFailure(state, 1_000);
      expect(lockRemainingMs(state, 1_000)).toBe(0);
    }
    state = registerPinFailure(state, 1_000);
    expect(lockRemainingMs(state, 1_000)).toBe(PIN_LOCK_MS);
    expect(lockRemainingMs(state, 1_000 + PIN_LOCK_MS)).toBe(0);
  });

  it('starts counting again after the lock expires', () => {
    let state = NO_ATTEMPTS;
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) state = registerPinFailure(state, 0);
    const later = PIN_LOCK_MS + 1;
    state = registerPinFailure(state, later);
    expect(state.failures).toBe(1);
    expect(lockRemainingMs(state, later)).toBe(0);
  });
});
