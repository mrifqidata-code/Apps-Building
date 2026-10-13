import { formatJakartaDate, type IsoDateTime } from './time';

/**
 * What a store pays for. Using Reqap on one phone without an account is
 * free and has no plan; the cloud (sync, backup, more phones) needs one.
 * The server enforces it (supabase/migrations/…_m7_paket.sql); the app only
 * shows it.
 */
export type PlanName = 'trial' | 'toko';

export interface StorePlan {
  plan: PlanName;
  /** Null: no end date. */
  activeUntil: IsoDateTime | null;
}

/** Free trial of a new cloud store, as set in the M7 SQL. */
export const TRIAL_DAYS = 30;
/** From this many days before the end, the owner is reminded to extend. */
export const PLAN_REMINDER_DAYS = 7;

export const PLAN_LABELS: Record<PlanName, string> = {
  trial: 'Uji coba gratis',
  toko: 'Paket Toko',
};

export type PlanState =
  { kind: 'unlimited' } | { kind: 'active' | 'ending'; daysLeft: number } | { kind: 'expired' };

const DAY_MS = 24 * 60 * 60 * 1000;

export function planState(plan: StorePlan, now: IsoDateTime): PlanState {
  if (plan.activeUntil === null) return { kind: 'unlimited' };
  const left = Date.parse(plan.activeUntil) - Date.parse(now);
  if (left <= 0) return { kind: 'expired' };
  const daysLeft = Math.ceil(left / DAY_MS);
  return { kind: daysLeft <= PLAN_REMINDER_DAYS ? 'ending' : 'active', daysLeft };
}

/** "Aktif sampai 12 Nov 2026 (30 hari lagi)", "Tanpa batas waktu", or "Berakhir 12 Nov 2026". */
export function planPeriodText(plan: StorePlan, now: IsoDateTime): string {
  const state = planState(plan, now);
  if (state.kind === 'unlimited') return 'Tanpa batas waktu';
  const until = formatJakartaDate(plan.activeUntil!);
  if (state.kind === 'expired') return `Berakhir ${until}`;
  return `Aktif sampai ${until} (${state.daysLeft} hari lagi)`;
}

/** One line for the owner when the plan is about to end or has ended; null otherwise. */
export function planReminderText(plan: StorePlan, now: IsoDateTime): string | null {
  const state = planState(plan, now);
  if (state.kind === 'ending') {
    return `${PLAN_LABELS[plan.plan]} berakhir ${state.daysLeft} hari lagi. Perpanjang supaya sinkron tidak berhenti.`;
  }
  if (state.kind === 'expired') {
    return 'Masa aktif paket habis, jadi sinkron berhenti. Kasir tetap jalan.';
  }
  return null;
}

/** WhatsApp message to the operator, with what they need to find the store. */
export function planRenewalMessage(storeName: string, storeId: string): string {
  return [
    'Halo, saya ingin memperpanjang paket Reqap.',
    `Toko: ${storeName}`,
    `ID toko: ${storeId}`,
  ].join('\n');
}
