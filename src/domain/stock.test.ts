import { describe, expect, it } from 'vitest';
import {
  formatStock,
  isThinMargin,
  marginBps,
  stockByProduct,
  stockOnHand,
  stockStatus,
  type StockEntry,
} from './stock';

let seq = 0;
const at = (hhmm: string) => `2026-10-11T${hhmm}:00.000Z`;
function move(
  time: string,
  type: StockEntry['type'],
  qtyDelta: number,
  countedQty: number | null = null,
): StockEntry {
  // Ids sort like UUIDv7: by time, then creation order.
  return {
    id: `${time}-${String(++seq).padStart(4, '0')}`,
    createdAt: at(time),
    type,
    qtyDelta,
    countedQty,
  };
}

describe('stockOnHand', () => {
  it('adds up the movements when there was never an opname', () => {
    expect(stockOnHand([])).toBe(0);
    expect(
      stockOnHand([move('01:00', 'in', 20), move('02:00', 'sale', -3), move('03:00', 'sale', -2)]),
    ).toBe(15);
  });

  it('starts from the latest count and adds what came after it', () => {
    const movements = [
      move('01:00', 'in', 20),
      move('02:00', 'sale', -3),
      move('03:00', 'opname', -2, 15), // counted 15 (this phone saw 17)
      move('04:00', 'sale', -1),
      move('05:00', 'in', 10),
    ];
    expect(stockOnHand(movements)).toBe(15 - 1 + 10);
  });

  it('does not count a sale twice when it syncs after a later opname', () => {
    // Another phone sold 2 at 02:30 while offline. The owner counted at 03:00
    // (those 2 were already gone from the shelf) before that sale arrived.
    const before = [move('01:00', 'in', 20), move('03:00', 'opname', -3, 17)];
    const lateSale = move('02:30', 'sale', -2);
    expect(stockOnHand(before)).toBe(17);
    expect(stockOnHand([...before, lateSale])).toBe(17);
  });

  it('uses only the most recent opname, in any order', () => {
    const movements = [
      move('05:00', 'opname', 0, 8),
      move('01:00', 'opname', 0, 50),
      move('06:00', 'sale', -1),
      move('03:00', 'sale', -4),
    ];
    expect(stockOnHand(movements.reverse())).toBe(7);
  });

  it('breaks a same-millisecond tie by id', () => {
    const opname = { ...move('03:00', 'opname', 0, 10), id: 'b' };
    const sameTimeBefore = { ...move('03:00', 'sale', -1), id: 'a' };
    const sameTimeAfter = { ...move('03:00', 'sale', -1), id: 'c' };
    expect(stockOnHand([opname, sameTimeBefore, sameTimeAfter])).toBe(9);
  });

  it('groups by product', () => {
    const levels = stockByProduct([
      { ...move('01:00', 'in', 5), productId: 'a' },
      { ...move('01:00', 'in', 7), productId: 'b' },
      { ...move('02:00', 'sale', -1), productId: 'a' },
    ]);
    expect(levels).toEqual(
      new Map([
        ['a', 4],
        ['b', 7],
      ]),
    );
  });
});

describe('stock status', () => {
  it('is out at zero or below, low at or under the threshold', () => {
    expect(stockStatus(0, 5)).toBe('out');
    expect(stockStatus(-2, null)).toBe('out');
    expect(stockStatus(5, 5)).toBe('low');
    expect(stockStatus(6, 5)).toBe('ok');
    expect(stockStatus(1, null)).toBe('ok');
  });

  it('formats for the kasir tiles and lists', () => {
    expect(formatStock(0, 5)).toBe('Habis');
    expect(formatStock(-2, 5)).toBe('Habis (-2)');
    expect(formatStock(3, 5)).toBe('Sisa 3');
    expect(formatStock(12, 5)).toBe('Stok 12');
  });
});

describe('margin', () => {
  it('warns below 20% and when HPP reaches the price', () => {
    expect(marginBps(10_000, 8_000)).toBe(2_000);
    expect(isThinMargin(10_000, 8_000)).toBe(false);
    expect(isThinMargin(10_000, 8_001)).toBe(true);
    expect(isThinMargin(10_000, 10_000)).toBe(true);
    expect(isThinMargin(10_000, 12_000)).toBe(true);
    expect(isThinMargin(22_000, 8_000)).toBe(false);
  });

  it('handles free products', () => {
    expect(marginBps(0, 0)).toBeNull();
    expect(isThinMargin(0, 0)).toBe(false);
    expect(isThinMargin(0, 1_000)).toBe(true);
  });
});
