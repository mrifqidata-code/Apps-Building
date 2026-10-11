import { assertRupiah, type Rupiah } from '../domain/money';
import { summarizeShift, type ShiftSummary } from '../domain/shift';
import type { IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';
import { newRow, touched } from './rows';
import type { CashMovement, CashMovementType, Shift } from './schema';

/**
 * Buka kasir, kas masuk/keluar and tutup kasir on this device. A device has
 * at most one open shift; every sale is recorded in it (see completeSale).
 */

export class ShiftError extends Error {}

export const MAX_CASH_REASON_LENGTH = 80;
export const MAX_SHIFT_NOTE_LENGTH = 200;

function assertCash(amount: Rupiah, label: string, allowZero: boolean) {
  assertRupiah(amount, label);
  const name = `${label[0]!.toUpperCase()}${label.slice(1)}`;
  if (amount < 0) throw new ShiftError(`${name} tidak boleh negatif.`);
  if (!allowZero && amount === 0) throw new ShiftError(`${name} harus lebih dari Rp0.`);
}

/** The device's open shift, or undefined when the drawer is closed. */
export function getOpenShift(database: PosDatabase, deviceId: string): Promise<Shift | undefined> {
  return database.shifts
    .where('deviceId')
    .equals(deviceId)
    .filter((s) => s.closedAt === null && s.deletedAt === null)
    .first();
}

export interface OpenShiftInput {
  storeId: string;
  deviceId: string;
  userId: string;
  openingCash: Rupiah;
  now: IsoDateTime;
}

/** Opens the drawer with a starting float. Returns the already open shift if there is one. */
export async function openShift(database: PosDatabase, input: OpenShiftInput): Promise<Shift> {
  assertCash(input.openingCash, 'modal awal', true);
  return database.transaction('rw', database.shifts, async () => {
    const open = await getOpenShift(database, input.deviceId);
    if (open) return open;
    const shift: Shift = {
      ...newRow(input.storeId, input.now),
      deviceId: input.deviceId,
      openedBy: input.userId,
      openedAt: input.now,
      openingCash: input.openingCash,
      closedBy: null,
      closedAt: null,
      expectedCash: null,
      countedCash: null,
      cashDifference: null,
      note: null,
    };
    await database.shifts.add(shift);
    return shift;
  });
}

export interface CashMovementInput {
  storeId: string;
  deviceId: string;
  userId: string;
  type: CashMovementType;
  amount: Rupiah;
  reason: string;
  now: IsoDateTime;
}

/** Records cash put into or taken out of the drawer during the open shift. */
export async function addCashMovement(
  database: PosDatabase,
  input: CashMovementInput,
): Promise<CashMovement> {
  assertCash(input.amount, 'jumlah', false);
  const reason = input.reason.trim();
  if (!reason) throw new ShiftError('Tulis alasannya, misalnya "Beli es batu".');
  if (reason.length > MAX_CASH_REASON_LENGTH) {
    throw new ShiftError(`Alasan maksimal ${MAX_CASH_REASON_LENGTH} karakter.`);
  }
  return database.transaction('rw', database.shifts, database.cashMovements, async () => {
    const shift = await getOpenShift(database, input.deviceId);
    if (!shift) throw new ShiftError('Kasir belum dibuka.');
    const movement: CashMovement = {
      ...newRow(input.storeId, input.now),
      shiftId: shift.id,
      deviceId: input.deviceId,
      type: input.type,
      amount: input.amount,
      reason,
      userId: input.userId,
    };
    await database.cashMovements.add(movement);
    return movement;
  });
}

/** Sales and cash movements of a shift, summed up (from whatever this device has). */
export async function loadShiftSummary(database: PosDatabase, shift: Shift): Promise<ShiftSummary> {
  const [sales, movements] = await Promise.all([
    database.transactions.where('shiftId').equals(shift.id).toArray(),
    database.cashMovements.where('shiftId').equals(shift.id).toArray(),
  ]);
  return summarizeShift(
    shift.openingCash,
    sales,
    movements.filter((m) => m.deletedAt === null),
  );
}

export interface CloseShiftInput {
  shiftId: string;
  userId: string;
  /** Counted by hand before the expected amount is shown. */
  countedCash: Rupiah;
  note: string;
  now: IsoDateTime;
}

/**
 * Closes the drawer: stores what the system expected, what was counted and
 * the difference, all in one IndexedDB transaction with the sales it reads.
 */
export async function closeShift(
  database: PosDatabase,
  input: CloseShiftInput,
): Promise<{ shift: Shift; summary: ShiftSummary }> {
  assertCash(input.countedCash, 'uang fisik', true);
  const note = input.note.trim();
  if (note.length > MAX_SHIFT_NOTE_LENGTH) {
    throw new ShiftError(`Catatan maksimal ${MAX_SHIFT_NOTE_LENGTH} karakter.`);
  }
  return database.transaction(
    'rw',
    [database.shifts, database.transactions, database.cashMovements],
    async () => {
      const shift = await database.shifts.get(input.shiftId);
      if (!shift || shift.deletedAt) throw new ShiftError('Data kasir tidak ditemukan.');
      if (shift.closedAt) throw new ShiftError('Kasir ini sudah ditutup.');
      const summary = await loadShiftSummary(database, shift);
      const closed: Shift = {
        ...shift,
        ...touched(input.now),
        closedBy: input.userId,
        closedAt: input.now,
        expectedCash: summary.expectedCash,
        countedCash: input.countedCash,
        cashDifference: input.countedCash - summary.expectedCash,
        note: note || null,
      };
      await database.shifts.put(closed);
      return { shift: closed, summary };
    },
  );
}
