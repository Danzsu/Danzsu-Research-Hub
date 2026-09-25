import Link from "next/link";

// The preview's own view switcher (development only, English on purpose: it is a tool, not app UI).

export const PREVIEW_VIEWS = ["radar", "radar-empty", "library", "library-empty", "archive", "archive-empty"] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];

// min-w-10: the 40px rule holds here too, and the Playwright checklist measures these links ("post" alone is ~29px wide).
const linkClass = "focus-ring flex min-h-10 min-w-10 items-center justify-center aria-[current=page]:text-signal";

export function PreviewNav({ current, failWrites }: { current: PreviewView | "post"; failWrites: boolean }) {
  const fail = failWrites ? "&fail=1" : "";
  return (
    <nav aria-label="Preview views" className="flex flex-wrap gap-x-3 border-b-2 border-signal bg-ink px-4 font-mono text-xs text-paper">
      {PREVIEW_VIEWS.map((view) => (
        <Link key={view} href={`/dev/preview?view=${view}${fail}`} aria-current={view === current ? "page" : undefined} className={linkClass}>
          {view}
        </Link>
      ))}
      <Link href="/dev/preview/post" aria-current={current === "post" ? "page" : undefined} className={linkClass}>
        post
      </Link>
      {current !== "post" && (
        // Every write rejects like an offline fetch: the rollback and the error toast become visible.
        <Link href={`/dev/preview?view=${current}${failWrites ? "" : "&fail=1"}`} className="focus-ring ml-auto flex min-h-10 items-center text-signal">
          {failWrites ? "writes: fail" : "writes: ok"}
        </Link>
      )}
    </nav>
  );
}
