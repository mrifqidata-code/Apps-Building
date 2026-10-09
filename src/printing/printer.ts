import type { PosDatabase } from '../db/db';
import {
  PrinterError,
  reconnectBlePrinter,
  reconnectSerialPrinter,
  requestBlePrinter,
  requestSerialPrinter,
  type PrinterConnection,
  type PrinterKind,
} from './transports';

/** Per-device printer choice, kept in the local `meta` table (never synced). */
export const META_PRINTER = 'printer';

export interface PrinterPrefs {
  kind: PrinterKind;
  name: string;
  /** Web Bluetooth device id, used to reconnect without the picker when Chrome allows. */
  deviceId: string | null;
  /** Print the receipt right after payment when the printer is connected. */
  autoPrint: boolean;
}

export interface PrinterStatus {
  connected: boolean;
  name: string | null;
  kind: PrinterKind | null;
}

type Listener = () => void;

/**
 * Holds the printer connection for this browser session. Chrome needs a tap
 * to show the device picker the first time; after that the connection is
 * reused, and Bluetooth Classic ports are reopened without asking.
 */
export class PrinterManager {
  private connection: PrinterConnection | null = null;
  private status: PrinterStatus = { connected: false, name: null, kind: null };
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly database: PosDatabase,
    private readonly requesters = {
      ble: requestBlePrinter,
      serial: requestSerialPrinter,
    },
    private readonly reconnectors = {
      ble: (prefs: PrinterPrefs) =>
        prefs.deviceId ? reconnectBlePrinter(prefs.deviceId) : Promise.resolve(null),
      serial: () => reconnectSerialPrinter(),
    },
  ) {}

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = () => this.status;

  private setConnection(connection: PrinterConnection | null) {
    this.connection = connection;
    this.status = {
      connected: connection?.isConnected() ?? false,
      name: connection?.name ?? null,
      kind: connection?.kind ?? null,
    };
    this.listeners.forEach((listener) => listener());
  }

  async getPrefs(): Promise<PrinterPrefs | null> {
    return (
      ((await this.database.meta.get(META_PRINTER))?.value as PrinterPrefs | undefined) ?? null
    );
  }

  async savePrefs(patch: Partial<PrinterPrefs>) {
    const current = await this.getPrefs();
    if (!current && !patch.kind) return;
    const next: PrinterPrefs = {
      kind: 'ble',
      name: 'Printer',
      deviceId: null,
      autoPrint: false,
      ...current,
      ...patch,
    };
    await this.database.meta.put({ key: META_PRINTER, value: next });
  }

  /** Shows the device picker. Must run from a tap. */
  async connect(kind: PrinterKind): Promise<PrinterConnection> {
    await this.connection?.disconnect().catch(() => undefined);
    const connection = await this.requesters[kind]();
    this.setConnection(connection);
    await this.savePrefs({ kind, name: connection.name, deviceId: connection.deviceId });
    return connection;
  }

  /** Reuses the open connection or reopens the remembered printer, without a picker. */
  async reconnect(): Promise<PrinterConnection | null> {
    if (this.connection?.isConnected()) return this.connection;
    if (this.connection) return this.connection; // write() reconnects BLE on demand.
    const prefs = await this.getPrefs();
    if (!prefs) return null;
    const connection = await this.reconnectors[prefs.kind](prefs).catch(() => null);
    if (connection) this.setConnection(connection);
    return connection;
  }

  /**
   * Sends bytes to the printer. With `allowPicker` (inside a tap), asks the
   * user to pick the printer again when it cannot be reopened silently.
   */
  async print(bytes: Uint8Array, { allowPicker = false } = {}): Promise<void> {
    let connection = await this.reconnect();
    if (!connection && allowPicker) {
      const prefs = await this.getPrefs();
      if (prefs) connection = await this.connect(prefs.kind);
    }
    if (!connection) throw new PrinterError('Printer belum dihubungkan. Atur di menu Pengaturan.');
    try {
      await connection.write(bytes);
      this.setConnection(connection);
    } catch (error) {
      // Drop a dead connection so the next print reconnects instead of failing again.
      await connection.disconnect().catch(() => undefined);
      this.setConnection(null);
      throw error;
    }
  }

  async forget() {
    await this.connection?.disconnect().catch(() => undefined);
    this.setConnection(null);
    await this.database.meta.delete(META_PRINTER);
  }
}
