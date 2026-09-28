// The mobile "Több" sheet's links (MOBILE_MORE_NAV in lib/nav.ts) sit in a closed Sheet, so Next never
// sees them in the viewport and never prefetches them, and a tap waits for the server. The app shell
// prefetches them once the browser is idle, and again whenever Next drops the entry (spec 2.4).

type Prefetch = (href: string, options: { onInvalidate: () => void }) => void;

/** The browser's next idle period (requestIdleCallback), or where it has none (Safari) 1 s on, clear of
 *  the page's own first requests. Returns the cancel. */
export function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task);
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(task, 1_000);
  return () => clearTimeout(timer);
}

/**
 * Prefetches each href once the browser is idle, and again each time Next invalidates it: a
 * router.refresh() clears the segment cache. A prefetch that throws is logged and skipped, so its link
 * still navigates as it would unprefetched. The cleanup cancels a pending idle call and stops the rest.
 */
export function prefetchWhenIdle(hrefs: readonly string[], prefetch: Prefetch, idle: (task: () => void) => () => void = whenIdle): () => void {
  let stopped = false;
  const run = (href: string) => {
    if (stopped) return;
    try {
      // ponytail: every refresh re-prefetches, the Library's 5 s poll included; a minimum interval would cut that.
      prefetch(href, { onInvalidate: () => run(href) });
    } catch (error) {
      console.warn(`prefetch ${href} failed`, error);
    }
  };
  const cancel = idle(() => hrefs.forEach(run));
  return () => {
    stopped = true;
    cancel();
  };
}
