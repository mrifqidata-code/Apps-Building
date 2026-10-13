import { useMemo } from 'react';
import { Link } from 'react-router';
import guideMarkdown from '../../../docs/panduan.md?raw';
import { useSession } from '../../app/session-context';
import { parseGuide, type GuideBlock, type TextRun } from '../../domain/guide-markdown';

/** The guide from docs/panduan.md, bundled into the app so it opens offline. */
export function HelpPage() {
  const { user } = useSession();
  const guide = useMemo(() => parseGuide(guideMarkdown), []);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      {/* Opened from the sign-in screen there is no menu, so offer the way back. */}
      {!user && (
        <Link to="/masuk" className="flex min-h-12 items-center font-semibold text-brand-800">
          ← Kembali ke layar masuk
        </Link>
      )}
      <h1 className="text-xl font-bold">Bantuan</h1>
      <Blocks blocks={guide.intro} />
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
              <Blocks blocks={section.blocks} />
            </div>
          </details>
        ))}
      </div>
    </main>
  );
}

function Runs({ runs }: { runs: TextRun[] }) {
  return runs.map((run, i) =>
    run.bold ? (
      <strong key={i} className="font-semibold text-slate-900">
        {run.text}
      </strong>
    ) : (
      <span key={i}>{run.text}</span>
    ),
  );
}

function Blocks({ blocks }: { blocks: GuideBlock[] }) {
  return blocks.map((block, i) => {
    if (block.kind === 'paragraph') {
      return (
        <p key={i}>
          <Runs runs={block.text} />
        </p>
      );
    }
    const List = block.ordered ? 'ol' : 'ul';
    return (
      <List
        key={i}
        className={`flex flex-col gap-2 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
      >
        {block.items.map((item, j) => (
          <li key={j}>
            <Runs runs={item.text} />
            {item.children.length > 0 && (
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {item.children.map((child, k) => (
                  <li key={k}>
                    <Runs runs={child} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </List>
    );
  });
}
