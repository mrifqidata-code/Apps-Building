/**
 * Ways to send bytes to a Bluetooth thermal printer from Chrome:
 * - BLE through Web Bluetooth (most "Bluetooth 4.0" printers)
 * - Bluetooth Classic (SPP) through Web Serial, Chrome Android 137+
 * Both only move bytes; what to print is decided by the ESC/POS encoder.
 */

export type PrinterKind = 'ble' | 'serial';

export interface PrinterConnection {
  kind: PrinterKind;
  name: string;
  /** Web Bluetooth device id, to find the same printer again later; null for serial. */
  deviceId: string | null;
  write(bytes: Uint8Array): Promise<void>;
  isConnected(): boolean;
  disconnect(): Promise<void>;
}

export class PrinterError extends Error {}

/** Standard Serial Port Profile service class, used by Bluetooth Classic printers. */
export const SPP_SERVICE_CLASS_ID = '00001101-0000-1000-8000-00805f9b34fb';

/**
 * GATT services that cheap 58 mm BLE printers expose for print data.
 * Printers rarely advertise them, so we accept all devices and look for
 * these after connecting.
 */
export const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
];

/** Bytes per BLE write: safe for the default ATT MTU most printers negotiate. */
export const BLE_CHUNK_BYTES = 100;
const SERIAL_CHUNK_BYTES = 512;

export function chunks(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += size) {
    out.push(bytes.subarray(start, start + size));
  }
  return out;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isBleSupported(): boolean {
  return typeof navigator !== 'undefined' && navigator.bluetooth !== undefined;
}

export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && navigator.serial !== undefined;
}

/* ---------------- BLE (Web Bluetooth) ---------------- */

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic> {
  for (const uuid of BLE_PRINTER_SERVICES) {
    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(uuid);
    } catch {
      continue; // This printer does not have that service.
    }
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find(
      (c) => c.properties.writeWithoutResponse || c.properties.write,
    );
    if (writable) return writable;
  }
  throw new PrinterError(
    'Perangkat ini tidak dikenali sebagai printer BLE. Coba tombol "Bluetooth Classic".',
  );
}

export async function connectBleDevice(device: BluetoothDevice): Promise<PrinterConnection> {
  if (!device.gatt) throw new PrinterError('Perangkat Bluetooth ini tidak bisa dihubungkan.');
  const server = await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);
  const withoutResponse = characteristic.properties.writeWithoutResponse;

  return {
    kind: 'ble',
    name: device.name || 'Printer Bluetooth',
    deviceId: device.id,
    isConnected: () => device.gatt?.connected ?? false,
    async write(bytes) {
      if (!device.gatt?.connected) await device.gatt?.connect();
      for (const chunk of chunks(bytes, BLE_CHUNK_BYTES)) {
        if (withoutResponse) {
          await characteristic.writeValueWithoutResponse(chunk);
          // Give the printer's small buffer time to drain.
          await pause(15);
        } else {
          await characteristic.writeValueWithResponse(chunk);
        }
      }
    },
    async disconnect() {
      device.gatt?.disconnect();
    },
  };
}

/** Opens Chrome's device picker (needs a tap) and connects to the chosen printer. */
export async function requestBlePrinter(): Promise<PrinterConnection> {
  if (!navigator.bluetooth) throw new PrinterError('Browser ini tidak mendukung Bluetooth.');
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_PRINTER_SERVICES,
  });
  return connectBleDevice(device);
}

/** Reconnects to a BLE printer chosen before, without the picker, if Chrome allows it. */
export async function reconnectBlePrinter(deviceId: string): Promise<PrinterConnection | null> {
  const devices = (await navigator.bluetooth?.getDevices?.()) ?? [];
  const device = devices.find((d) => d.id === deviceId);
  return device ? connectBleDevice(device) : null;
}

/* ---------------- Bluetooth Classic (Web Serial) ---------------- */

export async function connectSerialPort(port: SerialPort): Promise<PrinterConnection> {
  try {
    await port.open({ baudRate: 9600 });
  } catch (error) {
    // Already open from an earlier print in this session is fine.
    if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error;
  }
  let open = true;
  return {
    kind: 'serial',
    name: 'Printer Bluetooth Classic',
    deviceId: null,
    isConnected: () => open && port.writable !== null,
    async write(bytes) {
      if (!port.writable) throw new PrinterError('Printer terputus. Hubungkan ulang.');
      const writer = port.writable.getWriter();
      try {
        for (const chunk of chunks(bytes, SERIAL_CHUNK_BYTES)) await writer.write(chunk);
      } finally {
        writer.releaseLock();
      }
    },
    async disconnect() {
      open = false;
      await port.close().catch(() => undefined);
    },
  };
}

export async function requestSerialPrinter(): Promise<PrinterConnection> {
  if (!navigator.serial) throw new PrinterError('Browser ini tidak mendukung Bluetooth Classic.');
  const port = await navigator.serial.requestPort({
    filters: [{ bluetoothServiceClassId: SPP_SERVICE_CLASS_ID }],
    allowedBluetoothServiceClassIds: [SPP_SERVICE_CLASS_ID],
  });
  return connectSerialPort(port);
}

/** Chrome remembers serial ports the user allowed, so this needs no picker. */
export async function reconnectSerialPrinter(): Promise<PrinterConnection | null> {
  const ports = (await navigator.serial?.getPorts()) ?? [];
  const port =
    ports.find((p) => p.getInfo().bluetoothServiceClassId === SPP_SERVICE_CLASS_ID) ?? ports[0];
  return port ? connectSerialPort(port) : null;
}

/** Turns browser errors into messages a shop owner can act on. */
export function printerErrorMessage(error: unknown): string {
  if (error instanceof PrinterError) return error.message;
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') return 'Tidak ada printer yang dipilih.';
    if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
      return 'Izin Bluetooth ditolak. Izinkan Bluetooth untuk Chrome lalu coba lagi.';
    }
    if (error.name === 'NetworkError') {
      return 'Printer tidak bisa dihubungi. Pastikan printer menyala dan dekat dengan HP.';
    }
  }
  return `Gagal mencetak: ${error instanceof Error ? error.message : String(error)}`;
}
