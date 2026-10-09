import { toPrintable, type Align, type PrintLine } from './receipt-layout';

/**
 * ESC/POS commands understood by practically every 58 mm thermal printer,
 * including the cheap Bluetooth ones sold in Indonesia. Only the common
 * subset is used so the receipt prints the same on any brand.
 */
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const ALIGN: Record<Align, number> = { left: 0, center: 1, right: 2 };

/** 1-bit image: `data` holds rows of `widthBytes` bytes, MSB = leftmost dot, 1 = black. */
export interface Raster {
  widthBytes: number;
  height: number;
  data: Uint8Array;
}

/** Rows per GS v 0 command; small bands keep low-memory printers from choking. */
const RASTER_BAND_ROWS = 64;

export class EscPosBuilder {
  private readonly bytes: number[] = [];

  private push(...values: number[]) {
    this.bytes.push(...values);
    return this;
  }

  /** ESC @: reset formatting to the printer defaults. */
  init() {
    return this.push(ESC, 0x40);
  }

  align(align: Align) {
    return this.push(ESC, 0x61, ALIGN[align]);
  }

  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  /** GS !: 0x01 doubles the height only, so a line still fits 32 characters. */
  tall(on: boolean) {
    return this.push(GS, 0x21, on ? 0x01 : 0x00);
  }

  text(text: string) {
    for (const char of toPrintable(text)) this.bytes.push(char.charCodeAt(0));
    return this;
  }

  newline() {
    return this.push(LF);
  }

  /** ESC d n: feed n lines (so the paper can be torn off past the cutter bar). */
  feed(lines: number) {
    return this.push(ESC, 0x64, Math.max(0, Math.min(255, lines)));
  }

  /** GS v 0: print a 1-bit raster image, in bands. */
  image(raster: Raster) {
    const { widthBytes, height, data } = raster;
    for (let top = 0; top < height; top += RASTER_BAND_ROWS) {
      const rows = Math.min(RASTER_BAND_ROWS, height - top);
      this.push(GS, 0x76, 0x30, 0x00, widthBytes & 0xff, widthBytes >> 8, rows & 0xff, rows >> 8);
      const band = data.subarray(top * widthBytes, (top + rows) * widthBytes);
      for (const byte of band) this.bytes.push(byte);
    }
    return this;
  }

  line(line: PrintLine) {
    return this.align(line.align ?? 'left')
      .bold(line.bold ?? false)
      .tall(line.tall ?? false)
      .text(line.text)
      .newline();
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Full print job: optional logo, the lines, then a few blank lines to tear off. */
export function encodePrintJob(lines: PrintLine[], logo: Raster | null = null): Uint8Array {
  const builder = new EscPosBuilder().init();
  if (logo) builder.align('center').image(logo).newline();
  for (const line of lines) builder.line(line);
  return builder.bold(false).tall(false).align('left').feed(4).build();
}

/**
 * Converts RGBA pixels (as from canvas getImageData) to a 1-bit raster.
 * Transparent pixels count as white paper; darker than `threshold` prints.
 */
export function rgbaToRaster(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 160,
): Raster {
  if (rgba.length !== width * height * 4) throw new RangeError('ukuran gambar tidak cocok');
  const widthBytes = Math.ceil(width / 8);
  const data = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3]! / 255;
      // Blend onto white, then take perceived brightness.
      const luminance =
        (0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!) * alpha +
        255 * (1 - alpha);
      if (luminance < threshold) {
        const index = y * widthBytes + (x >> 3);
        data[index] = (data[index] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return { widthBytes, height, data };
}
