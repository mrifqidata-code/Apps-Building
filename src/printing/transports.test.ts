import { describe, expect, it } from 'vitest';
import {
  BLE_CHUNK_BYTES,
  BLE_PRINTER_SERVICES,
  PrinterError,
  SPP_SERVICE_CLASS_ID,
  chunks,
  connectBleDevice,
  connectSerialPort,
  printerErrorMessage,
} from './transports';

function fakeBleDevice(
  serviceUuid: string,
  props: { write: boolean; writeWithoutResponse: boolean },
) {
  const written: number[][] = [];
  const characteristic = {
    uuid: 'char',
    properties: props,
    writeValueWithResponse: async (value: ArrayBufferView | ArrayBuffer) => {
      written.push(Array.from(value as Uint8Array));
    },
    writeValueWithoutResponse: async (value: ArrayBufferView | ArrayBuffer) => {
      written.push(Array.from(value as Uint8Array));
    },
  };
  let connected = false;
  const server = {
    get connected() {
      return connected;
    },
    connect: async () => {
      connected = true;
      return server;
    },
    disconnect: () => {
      connected = false;
    },
    getPrimaryService: async (uuid: string) => {
      if (uuid !== serviceUuid) throw new DOMException('no service', 'NotFoundError');
      return { uuid, getCharacteristics: async () => [characteristic] };
    },
  };
  const device = { id: 'dev-1', name: 'RPP02N', gatt: server } as unknown as BluetoothDevice;
  return { device, written, server };
}

describe('chunks', () => {
  it('splits bytes into pieces of at most the given size', () => {
    const parts = chunks(new Uint8Array(250), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
  });
});

describe('BLE printers', () => {
  it('finds the print characteristic on a known printer service and writes in chunks', async () => {
    const { device, written } = fakeBleDevice(BLE_PRINTER_SERVICES[1]!, {
      write: true,
      writeWithoutResponse: false,
    });
    const connection = await connectBleDevice(device);
    expect(connection).toMatchObject({ kind: 'ble', name: 'RPP02N', deviceId: 'dev-1' });
    expect(connection.isConnected()).toBe(true);

    const bytes = Uint8Array.from({ length: BLE_CHUNK_BYTES * 2 + 5 }, (_, i) => i % 256);
    await connection.write(bytes);
    expect(written.map((w) => w.length)).toEqual([BLE_CHUNK_BYTES, BLE_CHUNK_BYTES, 5]);
    expect(written.flat()).toEqual(Array.from(bytes));
  });

  it('reconnects before writing if the printer went to sleep', async () => {
    const { device, written, server } = fakeBleDevice(BLE_PRINTER_SERVICES[0]!, {
      write: false,
      writeWithoutResponse: true,
    });
    const connection = await connectBleDevice(device);
    server.disconnect();
    await connection.write(Uint8Array.of(1, 2, 3));
    expect(server.connected).toBe(true);
    expect(written).toEqual([[1, 2, 3]]);
  });

  it('explains when the device is not a BLE printer', async () => {
    const { device } = fakeBleDevice('0000180f-0000-1000-8000-00805f9b34fb', {
      write: true,
      writeWithoutResponse: false,
    });
    await expect(connectBleDevice(device)).rejects.toThrow(PrinterError);
  });
});

describe('Bluetooth Classic printers (Web Serial)', () => {
  it('opens the port and streams the bytes', async () => {
    const received: number[] = [];
    let opened = false;
    const port = {
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          received.push(...chunk);
        },
      }),
      getInfo: () => ({ bluetoothServiceClassId: SPP_SERVICE_CLASS_ID }),
      open: async () => {
        opened = true;
      },
      close: async () => undefined,
    } as unknown as SerialPort;

    const connection = await connectSerialPort(port);
    expect(opened).toBe(true);
    await connection.write(Uint8Array.from({ length: 1_000 }, (_, i) => i % 256));
    expect(received).toHaveLength(1_000);
    // The writer is released, so a second print works too.
    await connection.write(Uint8Array.of(7));
    expect(received).toHaveLength(1_001);
  });
});

describe('printerErrorMessage', () => {
  it('turns browser errors into plain Indonesian', () => {
    expect(printerErrorMessage(new DOMException('x', 'NotFoundError'))).toBe(
      'Tidak ada printer yang dipilih.',
    );
    expect(printerErrorMessage(new DOMException('x', 'NetworkError'))).toContain(
      'Pastikan printer menyala',
    );
    expect(printerErrorMessage(new PrinterError('Pesan khusus'))).toBe('Pesan khusus');
  });
});
