import { describe, expect, it } from 'vitest';
import panduan from '../../docs/panduan.md?raw';
import { parseGuide, parseInline } from './guide-markdown';

describe('parseGuide', () => {
  it('reads the title, sections, paragraphs, lists and bold text', () => {
    const guide = parseGuide(
      [
        '# Panduan',
        '',
        'Halo **semua**.',
        '',
        '## Jualan',
        '',
        '1. Ketuk **Bayar**.',
        '2. Pilih metode:',
        '   - **Tunai**',
        '   - QRIS',
        '',
        'Baris satu',
        'baris dua.',
        '',
        '- Catatan',
      ].join('\n'),
    );
    expect(guide.title).toBe('Panduan');
    expect(guide.intro).toEqual([
      {
        kind: 'paragraph',
        text: [
          { text: 'Halo ', bold: false },
          { text: 'semua', bold: true },
          { text: '.', bold: false },
        ],
      },
    ]);
    expect(guide.sections).toHaveLength(1);
    const [ordered, paragraph, bullets] = guide.sections[0]!.blocks;
    expect(ordered).toMatchObject({ kind: 'list', ordered: true });
    expect(ordered?.kind === 'list' && ordered.items[1]!.children).toEqual([
      [{ text: 'Tunai', bold: true }],
      [{ text: 'QRIS', bold: false }],
    ]);
    expect(paragraph).toEqual({
      kind: 'paragraph',
      text: [{ text: 'Baris satu baris dua.', bold: false }],
    });
    expect(bullets).toMatchObject({ kind: 'list', ordered: false });
  });

  it('refuses Markdown the app cannot show', () => {
    expect(() => parseGuide('# A\n\n| a | b |')).toThrow('tidak didukung');
    expect(() => parseGuide('# A\n\n### Kecil')).toThrow('tidak didukung');
    expect(() => parseGuide('# A\n\n> kutipan')).toThrow('tidak didukung');
    expect(() => parseGuide('Tanpa judul')).toThrow('judul');
    expect(() => parseInline('**tebal')).toThrow('berpasangan');
  });

  it('reads docs/panduan.md, which the Bantuan page shows', () => {
    const guide = parseGuide(panduan);
    expect(guide.title).toBe('Panduan Reqap');
    expect(guide.sections.map((s) => s.title)).toEqual(
      expect.arrayContaining([
        'Menyiapkan toko (pemilik, sekali saja)',
        'Menghubungkan printer',
        'Menutup kasir',
        'Membatalkan transaksi (void dan refund)',
      ]),
    );
  });
});
