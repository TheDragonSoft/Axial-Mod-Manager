import type { ReactNode } from "react";

/**
 * Markdown-lite renderer for release notes: `#`/`##` section headings,
 * `-`/`*` bullets, and `**bold**` inline spans — the subset GitHub release
 * bodies use for changelogs. Everything else renders as plain paragraphs.
 *
 * Sanitized by construction: the source is split into tokens and mapped to
 * React elements, so upstream text can never inject HTML or attributes
 * (no dangerouslySetInnerHTML anywhere).
 */
export default function MarkdownLite({
  source,
  stagger = false,
}: {
  source: string;
  /** Stagger-fade bullets 30 ms apart (A5 popover animation). */
  stagger?: boolean;
}) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  // Split on **bold** spans; odd indices are the bold content.
  function inline(text: string, keyPrefix: string): ReactNode[] {
    return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
      i % 2 === 1 ? (
        <strong key={`${keyPrefix}${i}`} className="font-semibold text-stone-100">
          {part}
        </strong>
      ) : (
        <span key={`${keyPrefix}${i}`}>{part}</span>
      ),
    );
  }

  function flushBullets() {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="animate-bullet-in flex gap-2 text-sm leading-relaxed text-stone-300"
            style={
              stagger && i > 0 ? { animationDelay: `${i * 30}ms` } : undefined
            }
          >
            <span
              aria-hidden
              className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-600"
            />
            <span>{inline(item, `li-${blocks.length}-${i}-`)}</span>
          </li>
        ))}
      </ul>,
    );
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushBullets();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets();
      blocks.push(
        <p
          key={`h-${blocks.length}`}
          className="pb-0.5 text-sm font-bold text-stone-100"
        >
          {inline(heading[1], `h-${blocks.length}-`)}
        </p>,
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    blocks.push(
      <p
        key={`p-${blocks.length}`}
        className="text-sm leading-relaxed text-stone-400"
      >
        {inline(line, `p-${blocks.length}-`)}
      </p>,
    );
  }
  flushBullets();

  if (blocks.length === 0) return null;
  return <div className="space-y-2.5">{blocks}</div>;
}
