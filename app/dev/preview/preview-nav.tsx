import Link from "next/link";

// The preview's own view switcher (development only, English on purpose: it is a tool, not app UI).

export const PREVIEW_VIEWS = [
  "radar",
  "radar-empty",
  "companies",
  "library",
  "library-empty",
  "archive",
  "archive-empty",
  // The (app) pages' loading skeletons: /dev has no loading.tsx, so offline this is the only way to see them.
  "radar-loading",
  "library-loading",
  "archive-loading",
  "post-loading",
] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];

/** `&slow=1`: the link chat's in-memory transport holds every answer this long, so its in-flight states show. */
export const previewDelayMs = (slow: string | undefined) => (slow === "1" ? 800 : 0);

// min-w-10: the 40px rule holds here too, and the Playwright checklist measures these links ("post" alone is ~29px wide).
const linkClass = "focus-ring flex min-h-10 min-w-10 items-center justify-center aria-[current=page]:text-signal";

/** A preview link with its view and whichever of the fail=1 and slow=1 switches are on. */
function previewHref(path: string, { view, fail = false, slow }: { view?: string; fail?: boolean; slow: boolean }) {
  const query = new URLSearchParams();
  if (view) query.set("view", view);
  if (fail) query.set("fail", "1");
  if (slow) query.set("slow", "1");
  return query.size ? `${path}?${query}` : path;
}

export function PreviewNav({ current, failWrites, slow }: { current: PreviewView | "post"; failWrites: boolean; slow: boolean }) {
  // Every link keeps slow=1, and the view links keep fail=1 (the post page has no writes to fail).
  return (
    <nav aria-label="Preview views" className="flex flex-wrap gap-x-3 border-b-2 border-signal bg-ink px-4 font-mono text-xs text-paper">
      {PREVIEW_VIEWS.map((view) => (
        <Link key={view} href={previewHref("/dev/preview", { view, fail: failWrites, slow })} aria-current={view === current ? "page" : undefined} className={linkClass}>
          {view}
        </Link>
      ))}
      <Link href={previewHref("/dev/preview/post", { slow })} aria-current={current === "post" ? "page" : undefined} className={linkClass}>
        post
      </Link>
      {current !== "post" && (
        // Every write rejects like an offline fetch: the rollback and the error toast become visible.
        <Link href={previewHref("/dev/preview", { view: current, fail: !failWrites, slow })} className="focus-ring ml-auto flex min-h-10 items-center text-signal">
          {failWrites ? "writes: fail" : "writes: ok"}
        </Link>
      )}
    </nav>
  );
}
