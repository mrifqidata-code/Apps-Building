import type { Page } from '@playwright/test';

/**
 * Fake Bluetooth printers for e2e tests. They replace the browser's Web
 * Bluetooth / Web Serial with objects that record every byte sent, so tests
 * can check what would come out of the printer.
 */

declare global {
  interface Window {
    __printed: number[];
  }
}

/** A BLE printer exposing the common 0x18F0 print service. */
export async function installFakeBlePrinter(page: Page, name = 'Putian 583-01') {
  await page.addInitScript((printerName) => {
    window.__printed = [];
    const characteristic = {
      uuid: '00002af1-0000-1000-8000-00805f9b34fb',
      properties: { write: true, writeWithoutResponse: false },
      writeValueWithResponse: async (value: Uint8Array) => {
        window.__printed.push(...value);
      },
      writeValueWithoutResponse: async (value: Uint8Array) => {
        window.__printed.push(...value);
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
        if (uuid !== '000018f0-0000-1000-8000-00805f9b34fb') {
          throw new DOMException('Service not found', 'NotFoundError');
        }
        return { uuid, getCharacteristics: async () => [characteristic] };
      },
    };
    const device = Object.assign(new EventTarget(), {
      id: 'fake-1',
      name: printerName,
      gatt: server,
    });
    const bluetooth = {
      getAvailability: async () => true,
      requestDevice: async () => device,
      getDevices: async () => [device],
    };
    Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => bluetooth });
    Object.defineProperty(Navigator.prototype, 'serial', { get: () => undefined });
  }, name);
}

/** A Bluetooth Classic (SPP) printer reached through Web Serial. */
export async function installFakeSerialPrinter(page: Page) {
  await page.addInitScript(() => {
    window.__printed = [];
    const port = {
      writable: null as WritableStream<Uint8Array> | null,
      getInfo: () => ({ bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb' }),
      open: async () => {
        port.writable = new WritableStream<Uint8Array>({
          write(chunk) {
            window.__printed.push(...chunk);
          },
        });
      },
      close: async () => {
        port.writable = null;
      },
    };
    const serial = { requestPort: async () => port, getPorts: async () => [port] };
    Object.defineProperty(Navigator.prototype, 'serial', { get: () => serial });
    Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => undefined });
  });
}

/** A browser without any Bluetooth printing support (e.g. iPhone Safari). */
export async function removeBluetooth(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => undefined });
    Object.defineProperty(Navigator.prototype, 'serial', { get: () => undefined });
  });
}

/** Printable text the fake printer received so far (ESC/POS commands become dots). */
export async function printedText(page: Page): Promise<string> {
  const bytes = await page.evaluate(() => window.__printed);
  return bytes
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : b === 0x0a ? '\n' : '·'))
    .join('');
}

export async function clearPrinted(page: Page) {
  await page.evaluate(() => {
    window.__printed = [];
  });
}
