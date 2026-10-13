import { useMemo } from 'react';
import privacyMarkdown from '../../../docs/kebijakan-privasi.md?raw';
import termsMarkdown from '../../../docs/syarat-layanan.md?raw';
import { parseGuide } from '../../domain/guide-markdown';
import { GuideBlocks } from '../bantuan/GuideBlocks';
import { BackToSignIn } from '../bantuan/HelpPage';

const DOCUMENTS = { syarat: termsMarkdown, privasi: privacyMarkdown };

/** Syarat Layanan or Kebijakan Privasi, bundled so they open offline too. */
export function LegalPage({ doc }: { doc: keyof typeof DOCUMENTS }) {
  const guide = useMemo(() => parseGuide(DOCUMENTS[doc]), [doc]);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 text-slate-700">
      <BackToSignIn />
      <h1 className="text-xl font-bold text-slate-900">{guide.title}</h1>
      <GuideBlocks blocks={guide.intro} />
      {guide.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          <GuideBlocks blocks={section.blocks} />
        </section>
      ))}
    </main>
  );
}
