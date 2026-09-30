import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps, type ComponentType } from "react";
import { render } from "../../lib/test/render.ts";

const { LanguageProvider } = await import("./language-context.tsx");
const loadings: [string, ComponentType][] = [
  ["/", (await import("../(app)/(radar)/loading.tsx")).default],
  ["/archive/[week]", (await import("../(app)/archive/[week]/loading.tsx")).default],
  ["/companies", (await import("../(app)/companies/loading.tsx")).default],
  ["/library", (await import("../(app)/library/(list)/loading.tsx")).default],
  ["/archive", (await import("../(app)/archive/(list)/loading.tsx")).default],
  ["/library/[id]", (await import("../(app)/library/[id]/loading.tsx")).default],
];

// Spec 2.2. Kills a skeleton without its live region, with two (every one used to carry a visible
// "LOADING / BETÖLTÉS…" line besides), in one language only, or without aria-busy on its root.
test("each of the six loading.tsx says Betöltés… / Loading… once, to assistive tech, on a busy root", () => {
  for (const [route, Loading] of loadings) {
    for (const [language, text] of [["hu", "Betöltés…"], ["en", "Loading…"]] as const) {
      const doc = render(createElement(LanguageProvider, { initial: language } as ComponentProps<typeof LanguageProvider>, createElement(Loading)));
      const status = [...doc.querySelectorAll('[role="status"]')].map((element) => element.textContent);
      assert.deepEqual(status, [text], `${route} ${language}`);
      assert.equal(doc.body.firstElementChild?.getAttribute("aria-busy"), "true", `${route} ${language}`);
    }
  }
});
