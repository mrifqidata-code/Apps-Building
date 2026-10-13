/**
 * Reads the small Markdown subset docs/panduan.md is written in, so the
 * in-app Bantuan page and the guide on GitHub come from one file without a
 * Markdown library:
 *
 * - `# Title` once, then `## Section` headings
 * - paragraphs (consecutive lines join with a space)
 * - `- ` bullets and `1. ` numbered lists, with one level of indented bullets
 * - `**bold**` inside text
 *
 * Anything else (tables, quotes, code, `###`) is refused, so the guide never
 * silently shows raw Markdown in the app.
 */

export interface TextRun {
  text: string;
  bold: boolean;
}

export interface GuideListItem {
  text: TextRun[];
  children: TextRun[][];
}

export type GuideBlock =
  | { kind: 'paragraph'; text: TextRun[] }
  | { kind: 'list'; ordered: boolean; items: GuideListItem[] };

export interface GuideSection {
  title: string;
  blocks: GuideBlock[];
}

export interface Guide {
  title: string;
  intro: GuideBlock[];
  sections: GuideSection[];
}

/** "Ketuk **Bayar** lalu" -> runs with bold where marked. */
export function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split('**');
  if (parts.length % 2 === 0) throw new Error(`Tanda ** tidak berpasangan: ${text}`);
  parts.forEach((part, i) => {
    if (part) runs.push({ text: part, bold: i % 2 === 1 });
  });
  return runs;
}

const BULLET = /^- (.*)$/;
const NUMBERED = /^\d+\. (.*)$/;
const NESTED_BULLET = /^ {2,}- (.*)$/;

export function parseGuide(markdown: string): Guide {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let title = '';
  const intro: GuideBlock[] = [];
  const sections: GuideSection[] = [];
  let blocks = intro;
  let paragraph: string[] = [];
  let list: Extract<GuideBlock, { kind: 'list' }> | null = null;

  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', text: parseInline(paragraph.join(' ')) });
    paragraph = [];
    list = null;
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const where = `baris ${index + 1}`;
    if (!line.trim()) {
      flush();
      return;
    }
    if (line.startsWith('# ')) {
      if (title) throw new Error(`Judul utama hanya boleh satu (${where})`);
      flush();
      title = line.slice(2).trim();
      return;
    }
    if (line.startsWith('## ')) {
      flush();
      const section = { title: line.slice(3).trim(), blocks: [] as GuideBlock[] };
      sections.push(section);
      blocks = section.blocks;
      return;
    }
    if (/^(#|\||>|```|<)/.test(line.trimStart())) {
      throw new Error(`Format tidak didukung di panduan (${where}): ${line}`);
    }

    const nested = NESTED_BULLET.exec(line);
    if (nested) {
      const owner = list?.items[list.items.length - 1];
      if (!owner) throw new Error(`Sub-butir tanpa butir induk (${where})`);
      owner.children.push(parseInline(nested[1]!));
      return;
    }
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', text: parseInline(paragraph.join(' ')) });
        paragraph = [];
      }
      if (!list || list.ordered !== ordered) {
        list = { kind: 'list', ordered, items: [] };
        blocks.push(list);
      }
      list.items.push({ text: parseInline((bullet ?? numbered)![1]!), children: [] });
      return;
    }
    if (list) throw new Error(`Baris lanjutan di dalam daftar tidak didukung (${where})`);
    paragraph.push(line.trim());
  });
  flush();

  if (!title) throw new Error('Panduan belum punya judul (# ...)');
  return { title, intro, sections };
}
