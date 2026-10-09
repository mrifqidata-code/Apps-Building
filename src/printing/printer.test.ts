import { afterEach, describe, expect, it } from 'vitest';
import { PosDatabase } from '../db/db';
import { META_PRINTER, PrinterManager, type PrinterPrefs } from './printer';
import type { PrinterConnection, PrinterKind } from './transports';

let database: PosDatabase | null = null;
afterEach(async () => {
  await database?.delete();
  database = null;
});

function fakeConnection(kind: PrinterKind, log: Uint8Array[]): PrinterConnection {
  let connected = true;
  return {
    kind,
    name: kind === 'ble' ? 'RPP02N' : 'Printer Bluetooth Classic',
    deviceId: kind === 'ble' ? 'dev-1' : null,
    isConnected: () => connected,
    write: async (bytes) => {
      log.push(bytes);
    },
    disconnect: async () => {
      connected = false;
    },
  };
}

function setup() {
  database = new PosDatabase(`test-${crypto.randomUUID()}`);
  const log: Uint8Array[] = [];
  const calls = { pickers: 0, reconnects: 0 };
  const manager = new PrinterManager(
    database,
    {
      ble: async () => {
        calls.pickers++;
        return fakeConnection('ble', log);
      },
      serial: async () => {
        calls.pickers++;
        return fakeConnection('serial', log);
      },
    },
    {
      ble: async () => {
        calls.reconnects++;
        return null;
      },
      serial: async () => {
        calls.reconnects++;
        return fakeConnection('serial', log);
      },
    },
  );
  return { manager, log, calls, database };
}

describe('PrinterManager', () => {
  it('refuses to print before a printer is set up', async () => {
    const { manager } = setup();
    await expect(manager.print(Uint8Array.of(1), { allowPicker: true })).rejects.toThrow(
      'Printer belum dihubungkan',
    );
  });

  it('connects, remembers the printer on this device and prints', async () => {
    const { manager, log, database } = setup();
    let notified = 0;
    manager.subscribe(() => notified++);

    await manager.connect('ble');
    expect(manager.getStatus()).toEqual({ connected: true, name: 'RPP02N', kind: 'ble' });
    expect(notified).toBeGreaterThan(0);
    expect((await database.meta.get(META_PRINTER))?.value).toEqual({
      kind: 'ble',
      name: 'RPP02N',
      deviceId: 'dev-1',
      autoPrint: false,
    } satisfies PrinterPrefs);

    await manager.print(Uint8Array.of(9));
    expect(log).toEqual([Uint8Array.of(9)]);
  });

  it('reopens a remembered Bluetooth Classic printer without the picker', async () => {
    const { manager, log, calls, database } = setup();
    await database.meta.put({
      key: META_PRINTER,
      value: { kind: 'serial', name: 'Putian', deviceId: null, autoPrint: true },
    });
    await manager.print(Uint8Array.of(5));
    expect(calls).toEqual({ pickers: 0, reconnects: 1 });
    expect(log).toHaveLength(1);
  });

  it('asks for the BLE printer again (inside a tap) when Chrome cannot reconnect silently', async () => {
    const { manager, calls, database } = setup();
    await database.meta.put({
      key: META_PRINTER,
      value: { kind: 'ble', name: 'RPP02N', deviceId: 'dev-1', autoPrint: false },
    });
    await expect(manager.print(Uint8Array.of(1))).rejects.toThrow('Printer belum dihubungkan');
    await manager.print(Uint8Array.of(1), { allowPicker: true });
    expect(calls.pickers).toBe(1);
  });

  it('keeps settings like auto print when reconnecting, and forgets everything on request', async () => {
    const { manager, database } = setup();
    await manager.connect('serial');
    await manager.savePrefs({ autoPrint: true });
    await manager.connect('serial');
    expect(((await manager.getPrefs()) as PrinterPrefs).autoPrint).toBe(true);

    await manager.forget();
    expect(manager.getStatus().connected).toBe(false);
    expect(await database.meta.get(META_PRINTER)).toBeUndefined();
  });

  it('drops a broken connection so the next print reconnects', async () => {
    const { manager, calls, database } = setup();
    await database.meta.put({
      key: META_PRINTER,
      value: { kind: 'serial', name: 'Putian', deviceId: null, autoPrint: false },
    });
    await manager.print(Uint8Array.of(1));
    expect(calls.reconnects).toBe(1);

    // Simulate the printer going away mid-session.
    const broken = (manager as unknown as { connection: PrinterConnection }).connection;
    broken.write = async () => {
      throw new DOMException('gone', 'NetworkError');
    };
    await expect(manager.print(Uint8Array.of(2))).rejects.toThrow('gone');
    expect(manager.getStatus().connected).toBe(false);

    await manager.print(Uint8Array.of(3));
    expect(calls.reconnects).toBe(2);
  });
});
