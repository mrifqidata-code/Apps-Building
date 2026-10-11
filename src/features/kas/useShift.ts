import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { CashMovement, Shift } from '../../db/schema';
import { getOpenShift, loadShiftSummary } from '../../db/shift';
import type { ShiftRecapView, ShiftSummary } from '../../domain/shift';

/** The open shift of this device: undefined while loading, null when the drawer is closed. */
export function useOpenShift(deviceId: string): Shift | null | undefined {
  return useLiveQuery(async () => (await getOpenShift(db, deviceId)) ?? null, [deviceId]);
}

export interface ShiftDetails {
  shift: Shift;
  summary: ShiftSummary;
  movements: CashMovement[];
  deviceLabel: string;
  openedByName: string;
  closedByName: string | null;
  /** Complete recap once the shift is closed. */
  recap: ShiftRecapView | null;
}

/** A shift with its sales summary, cash movements and the names to show. Null if not found. */
export function useShiftDetails(shiftId: string | undefined): ShiftDetails | null | undefined {
  return useLiveQuery(async () => {
    const shift = shiftId ? await db.shifts.get(shiftId) : undefined;
    if (!shift || shift.deletedAt) return null;
    const [summary, movements, device, store, users] = await Promise.all([
      loadShiftSummary(db, shift),
      db.cashMovements.where('shiftId').equals(shift.id).sortBy('id'),
      db.devices.get(shift.deviceId),
      db.stores.get(shift.storeId),
      db.users.bulkGet([shift.openedBy, shift.closedBy ?? shift.openedBy]),
    ]);
    const deviceLabel = device ? `${device.code} · ${device.name}` : 'Perangkat lain';
    const openedByName = users[0]?.name ?? '-';
    const closedByName = shift.closedBy ? (users[1]?.name ?? '-') : null;
    const live = movements.filter((m) => m.deletedAt === null);
    const recap: ShiftRecapView | null =
      shift.closedAt && shift.countedCash !== null && shift.cashDifference !== null
        ? {
            storeName: store?.name ?? '',
            deviceLabel,
            openedAt: shift.openedAt,
            openedByName,
            closedAt: shift.closedAt,
            closedByName: closedByName ?? '-',
            // The drawer as it was counted: expected cash stored at close.
            summary: { ...summary, expectedCash: shift.expectedCash ?? summary.expectedCash },
            countedCash: shift.countedCash,
            cashDifference: shift.cashDifference,
            movements: live,
            note: shift.note,
          }
        : null;
    return {
      shift,
      summary,
      movements: live,
      deviceLabel,
      openedByName,
      closedByName,
      recap,
    };
  }, [shiftId]);
}
