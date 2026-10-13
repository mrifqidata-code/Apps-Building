import { describe, expect, it } from 'vitest';
import { planPeriodText, planReminderText, planRenewalMessage, planState } from './plan';

const NOW = '2026-10-13T03:00:00.000Z';

describe('planState', () => {
  it('counts whole days left, and reminds in the last 7', () => {
    expect(planState({ plan: 'trial', activeUntil: '2026-11-12T03:00:00.000Z' }, NOW)).toEqual({
      kind: 'active',
      daysLeft: 30,
    });
    expect(planState({ plan: 'toko', activeUntil: '2026-10-20T03:00:00.000Z' }, NOW)).toEqual({
      kind: 'ending',
      daysLeft: 7,
    });
    // An hour left still counts as a day.
    expect(planState({ plan: 'toko', activeUntil: '2026-10-13T04:00:00.000Z' }, NOW)).toEqual({
      kind: 'ending',
      daysLeft: 1,
    });
  });

  it('is expired from the end time on, and unlimited without one', () => {
    expect(planState({ plan: 'trial', activeUntil: NOW }, NOW)).toEqual({ kind: 'expired' });
    expect(planState({ plan: 'toko', activeUntil: null }, NOW)).toEqual({ kind: 'unlimited' });
  });
});

describe('planPeriodText', () => {
  it('shows the end date in WIB', () => {
    expect(planPeriodText({ plan: 'trial', activeUntil: '2026-11-11T20:00:00.000Z' }, NOW)).toBe(
      'Aktif sampai 12 Nov 2026 (30 hari lagi)',
    );
    expect(planPeriodText({ plan: 'trial', activeUntil: '2026-10-01T00:00:00.000Z' }, NOW)).toBe(
      'Berakhir 1 Okt 2026',
    );
    expect(planPeriodText({ plan: 'toko', activeUntil: null }, NOW)).toBe('Tanpa batas waktu');
  });
});

describe('planReminderText', () => {
  it('speaks up only in the last 7 days and after the end', () => {
    expect(planReminderText({ plan: 'trial', activeUntil: '2026-11-12T03:00:00.000Z' }, NOW)).toBe(
      null,
    );
    expect(planReminderText({ plan: 'trial', activeUntil: '2026-10-16T03:00:00.000Z' }, NOW)).toBe(
      'Uji coba gratis berakhir 3 hari lagi. Perpanjang supaya sinkron tidak berhenti.',
    );
    expect(planReminderText({ plan: 'toko', activeUntil: '2026-10-01T00:00:00.000Z' }, NOW)).toBe(
      'Masa aktif paket habis, jadi sinkron berhenti. Kasir tetap jalan.',
    );
    expect(planReminderText({ plan: 'toko', activeUntil: null }, NOW)).toBe(null);
  });
});

it('planRenewalMessage names the store and its id', () => {
  expect(planRenewalMessage('Kedai Senja', 'abc-123')).toBe(
    'Halo, saya ingin memperpanjang paket Reqap.\nToko: Kedai Senja\nID toko: abc-123',
  );
});
