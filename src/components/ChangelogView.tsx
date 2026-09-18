import type { ChangelogEntry } from "../types";

/**
 * Renders changelog entries (portal order: newest first). Shared by the
 * VersionsModal (single newest entry) and the Installed page's expanded
 * rows (installed→latest delta). Warm-stone muted styling — informational
 * content, never a status signal.
 */
export default function ChangelogView({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.version}>
          <p className="font-mono text-xs text-stone-300">
            v{entry.version}
            {entry.date && <span className="ml-2 font-sans text-stone-400">{entry.date}</span>}
          </p>
          {entry.sections.map((section) => (
            <div key={section.heading} className="mt-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                {section.heading}
              </p>
              <ul className="mt-1 space-y-0.5">
                {section.bullets.map((bullet, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-xs leading-relaxed text-stone-300"
                  >
                    <span
                      aria-hidden
                      className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-stone-400"
                    />
                    <span className="min-w-0">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
