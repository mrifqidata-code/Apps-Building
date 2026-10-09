import { describe, expect, it } from 'vitest';
import { EscPosBuilder, encodePrintJob, rgbaToRaster } from './escpos';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');

describe('EscPosBuilder', () => {
  it('emits the standard commands', () => {
    const bytes = new EscPosBuilder()
      .init()
      .align('center')
      .bold(true)
      .tall(true)
      .text('Hi')
      .newline()
      .feed(3)
      .build();
    expect(hex(bytes)).toBe('1b 40 1b 61 01 1b 45 01 1d 21 01 48 69 0a 1b 64 03');
  });

  it('only sends printable ASCII', () => {
    const bytes = new EscPosBuilder().text('Café').build();
    expect(Array.from(bytes)).toEqual([0x43, 0x61, 0x66, 0x65]);
  });

  it('sends images as GS v 0 raster bands of at most 64 rows', () => {
    const raster = { widthBytes: 2, height: 70, data: new Uint8Array(2 * 70).fill(0xff) };
    const bytes = new EscPosBuilder().image(raster).build();
    // header (8) + 64 rows * 2 bytes, then header (8) + 6 rows * 2 bytes
    expect(bytes.length).toBe(8 + 128 + 8 + 12);
    expect(hex(bytes.subarray(0, 8))).toBe('1d 76 30 00 02 00 40 00');
    expect(hex(bytes.subarray(136, 144))).toBe('1d 76 30 00 02 00 06 00');
  });
});

describe('encodePrintJob', () => {
  it('resets the printer, prints each line with its style and feeds paper at the end', () => {
    const bytes = encodePrintJob([
      { text: 'Toko', align: 'center', bold: true },
      { text: 'Total', tall: true },
    ]);
    const text = new TextDecoder().decode(bytes);
    expect(hex(bytes.subarray(0, 2))).toBe('1b 40');
    expect(text).toContain('Toko\n');
    expect(text).toContain('Total\n');
    expect(hex(bytes.subarray(bytes.length - 3))).toBe('1b 64 04');
  });

  it('prints the logo first, centered', () => {
    const logo = { widthBytes: 1, height: 1, data: Uint8Array.of(0x80) };
    const bytes = encodePrintJob([{ text: 'x' }], logo);
    expect(hex(bytes.subarray(0, 14))).toBe('1b 40 1b 61 01 1d 76 30 00 01 00 01 00 80');
  });
});

describe('rgbaToRaster', () => {
  it('turns dark pixels into printed dots, MSB first', () => {
    // 10x1: black, white, black, then 7 white
    const rgba = new Uint8ClampedArray(10 * 4).fill(255);
    rgba.set([0, 0, 0, 255], 0);
    rgba.set([0, 0, 0, 255], 8);
    const raster = rgbaToRaster(rgba, 10, 1);
    expect(raster.widthBytes).toBe(2);
    expect(Array.from(raster.data)).toEqual([0b10100000, 0]);
  });

  it('treats transparent pixels as white paper', () => {
    const rgba = Uint8ClampedArray.of(0, 0, 0, 0);
    expect(Array.from(rgbaToRaster(rgba, 1, 1).data)).toEqual([0]);
  });

  it('rejects mismatched sizes', () => {
    expect(() => rgbaToRaster(new Uint8ClampedArray(4), 2, 2)).toThrow(RangeError);
  });
});
