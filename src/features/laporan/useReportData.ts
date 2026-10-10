import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { CashMovement, Transaction, TransactionItem } from '../../db/schema';
import { periodDays, periodRange, type Period } from '../../domain/period';
import { buildSalesReport, type SalesReport } from '../../domain/report';
import type { CsvNames, CsvShift } from '../../domain/report-csv';
import { summarizeShift } from '../../domain/shift';

export interface ReportShift extends CsvShift {
  id: string;
}

export interface ReportData {
  report: SalesReport;
  transactions: Transaction[];
  items: TransactionItem[];
  /** Shifts opened in the period, newest first. */
  shifts: ReportShift[];
  movements: CashMovement[];
  names: CsvNames;
}

/** Everything the report page shows for one period, from the data on this device. */
export function useReportData(storeId: string, period: Period): ReportData | undefined {
  return useLiveQuery(async () => {
    const [from, to] = periodRange(period);
    const inPeriod = <T extends { storeId: string; deletedAt: string | null }>(row: T) =>
      row.storeId === storeId && row.deletedAt === null;

    const [transactions, shifts, movements, users, devices] = await Promise.all([
      db.transactions.where('createdAt').between(from, to, true, false).filter(inPeriod).toArray(),
      db.shifts.where('openedAt').between(from, to, true, false).filter(inPeriod).toArray(),
      db.cashMovements.where('createdAt').between(from, to, true, false).filter(inPeriod).toArray(),
      db.users.where('storeId').equals(storeId).toArray(),
      db.devices.where('storeId').equals(storeId).toArray(),
    ]);
    const shiftIds = shifts.map((s) => s.id);
    const [items, shiftSales, shiftMovements] = await Promise.all([
      db.transactionItems
        .where('transactionId')
        .anyOf(transactions.map((t) => t.id))
        .filter((i) => i.deletedAt === null)
        .toArray(),
      db.transactions.where('shiftId').anyOf(shiftIds).toArray(),
      db.cashMovements
        .where('shiftId')
        .anyOf(shiftIds)
        .filter((m) => m.deletedAt === null)
        .toArray(),
    ]);

    const userName = new Map(users.map((u) => [u.id, u.name]));
    const deviceCode = new Map(devices.map((d) => [d.id, d.code]));
    const names: CsvNames = {
      user: (id) => userName.get(id) ?? '',
      device: (id) => deviceCode.get(id) ?? '',
    };

    const reportShifts: ReportShift[] = shifts
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .map((s) => ({
        id: s.id,
        deviceLabel: names.device(s.deviceId),
        openedAt: s.openedAt,
        openedByName: names.user(s.openedBy),
        closedAt: s.closedAt,
        closedByName: s.closedBy ? names.user(s.closedBy) : null,
        summary: summarizeShift(
          s.openingCash,
          shiftSales.filter((t) => t.shiftId === s.id),
          shiftMovements.filter((m) => m.shiftId === s.id),
        ),
        expectedCash: s.expectedCash,
        countedCash: s.countedCash,
        cashDifference: s.cashDifference,
        note: s.note,
      }));

    return {
      report: buildSalesReport(transactions, items, periodDays(period)),
      transactions,
      items,
      shifts: reportShifts,
      movements,
      names,
    };
  }, [storeId, period.kind, period.start, period.end]);
}
