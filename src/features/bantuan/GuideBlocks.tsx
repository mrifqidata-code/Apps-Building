import type { GuideBlock, TextRun } from '../../domain/guide-markdown';

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

/** Paragraphs and lists of a document read by parseGuide. */
export function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
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
