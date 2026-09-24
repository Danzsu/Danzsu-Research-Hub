// Offline component rendering for `node --test`, with no bundler and no extra dependency: importing
// this registers tsx-hooks.ts, so a test can then `await import("./component.tsx")` and render it.
// Import it before the component, which is why component tests load theirs with a dynamic import.

import { register } from "node:module";
import { parseHTML } from "linkedom";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

register("./tsx-hooks.ts", import.meta.url);

/** Server-renders `element` (hooks run once, no effects) and parses the markup for DOM queries. */
export function render(element: ReactElement): Document {
  return parseHTML(`<!doctype html><html><body>${renderToStaticMarkup(element)}</body></html>`).document as unknown as Document;
}
