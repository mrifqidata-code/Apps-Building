import { useMemo } from 'react';
import { Link } from 'react-router';
import guideMarkdown from '../../../docs/panduan.md?raw';
import { useSession } from '../../app/session-context';
import { parseGuide } from '../../domain/guide-markdown';
import { SupportLink } from '../../ui/SupportLink';
import { GuideBlocks } from './GuideBlocks';

/** Opened from the sign-in screen there is no menu, so offer the way back. */
export function BackToSignIn() {
  const { user } = useSession();
  if (user) return null;
  return (
    <Link to="/masuk" className="flex min-h-12 items-center font-semibold text-brand-800">
      ← Kembali ke layar masuk
    </Link>
  );
}

/** The guide from docs/panduan.md, bundled into the app so it opens offline. */
export function HelpPage() {
  const { store } = useSession();
  const guide = useMemo(() => parseGuide(guideMarkdown), []);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <BackToSignIn />
      <h1 className="text-xl font-bold">Bantuan</h1>
      <GuideBlocks blocks={guide.intro} />
      <div className="flex flex-col gap-2">
        {guide.sections.map((section) => (
          <details
            key={section.title}
            className="group rounded-2xl bg-white ring-1 ring-slate-200 open:ring-brand-300"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold">
              <span className="flex-1">{section.title}</span>
              <span
                aria-hidden
                className="text-2xl leading-none text-slate-400 transition group-open:rotate-90"
              >
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4 text-slate-700">
              <GuideBlocks blocks={section.blocks} />
            </div>
          </details>
        ))}
      </div>
      <section aria-label="Hubungi kami" className="flex flex-col gap-3 pt-2">
        <SupportLink
          message={`Halo, saya butuh bantuan memakai Reqap (toko ${store.name}).`}
          label="Hubungi kami lewat WhatsApp"
        />
        <nav aria-label="Dokumen" className="flex flex-wrap justify-center gap-x-4 text-sm">
          <Link to="/syarat" className="flex min-h-12 items-center text-brand-800 underline">
            Syarat Layanan
          </Link>
          <Link to="/privasi" className="flex min-h-12 items-center text-brand-800 underline">
            Kebijakan Privasi
          </Link>
        </nav>
      </section>
    </main>
  );
}
