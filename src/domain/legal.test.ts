import { describe, expect, it } from 'vitest';
import privacy from '../../docs/kebijakan-privasi.md?raw';
import terms from '../../docs/syarat-layanan.md?raw';
import { parseGuide } from './guide-markdown';
import { TERMS_VERSION, termsEffectiveLine } from './legal';

describe('Syarat Layanan dan Kebijakan Privasi', () => {
  it('both documents carry the version an owner agrees to', () => {
    expect(termsEffectiveLine('2026-10-13')).toBe('Berlaku sejak 13 Oktober 2026');
    for (const doc of [terms, privacy]) {
      const guide = parseGuide(doc);
      const intro = guide.intro.map((b) => (b.kind === 'paragraph' ? b.text : [])).flat();
      expect(intro.map((r) => r.text).join('')).toContain(termsEffectiveLine(TERMS_VERSION));
    }
  });

  it('are written in the Markdown the app can show', () => {
    expect(parseGuide(terms).title).toBe('Syarat Layanan Reqap');
    expect(parseGuide(privacy).title).toBe('Kebijakan Privasi Reqap');
    expect(parseGuide(privacy).sections.map((s) => s.title)).toContain('Hak Anda');
  });
});
