import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps, type ComponentType } from "react";
import { render } from "../../lib/test/render.ts";

const { LanguageProvider } = await import("./language-context.tsx");
const loadings: [string, ComponentType][] = [
  ["/", (await import("../(app)/(radar)/loading.tsx")).default],
  ["/archive/[week]", (await import("../(app)/archive/[week]/loading.tsx")).default],
  ["/companies", (await import("../(app)/companies/loading.tsx")).default],
  ["/daily", (await import("../(app)/daily/loading.tsx")).default],
  ["/library", (await import("../(app)/library/(list)/loading.tsx")).default],
  ["/archive", (await import("../(app)/archive/(list)/loading.tsx")).default],
  ["/library/[id]", (await import("../(app)/library/[id]/loading.tsx")).default],
];

// Spec 2.2. Kills a skeleton without its live region, with two (every one used to carry a visible
// "LOADING / BETÖLTÉS…" line besides), in one language only, or without aria-busy on its root.
test("each of the seven loading.tsx says Betöltés… / Loading… once, to assistive tech, on a busy root", () => {
  for (const [route, Loading] of loadings) {
    for (const [language, text] of [["hu", "Betöltés…"], ["en", "Loading…"]] as const) {
      const doc = render(createElement(LanguageProvider, { initial: language } as ComponentProps<typeof LanguageProvider>, createElement(Loading)));
      const status = [...doc.querySelectorAll('[role="status"]')].map((element) => element.textContent);
      assert.deepEqual(status, [text], `${route} ${language}`);
      assert.equal(doc.body.firstElementChild?.getAttribute("aria-busy"), "true", `${route} ${language}`);
    }
  }
});

// Final review #6. Kills the list skeleton's grid on its @container element: a container can't query its own
// size, so the skeleton stayed one column while the list has up to four, and the page jumped when it loaded.
test("the list skeletons' grid sits inside a container, not on it", () => {
  for (const route of ["/library", "/archive"]) {
    const Loading = loadings.find(([path]) => path === route)![1];
    const doc = render(createElement(LanguageProvider, { initial: "en" } as ComponentProps<typeof LanguageProvider>, createElement(Loading)));
    const grid = doc.querySelector('[class*="grid-cols-2"]');
    assert.ok(grid, route);
    assert.equal(grid.className.includes("@container"), false, route);
    assert.ok(grid.parentElement?.closest('[class*="@container"]'), `${route}: an ancestor container`);
  }
});

// 2026-11-01 review. Kills a Radar view's skeleton with a second band, or one that differs from the others: every
// Radar view now has the one band of the week and its views, so the hero never jumps when the page lands.
test("every Radar view's skeleton has the same one band", () => {
  const shape = (route: string) => {
    const Loading = loadings.find(([path]) => path === route)![1];
    const root = render(createElement(LanguageProvider, { initial: "en" } as ComponentProps<typeof LanguageProvider>, createElement(Loading))).body.firstElementChild;
    return [...(root?.children ?? [])].map((child) => child.className).join(" | ");
  };
  const radar = shape("/");
  for (const route of ["/daily", "/companies", "/archive/[week]"]) assert.equal(shape(route), radar, route);
  assert.equal(radar.split(" | ").filter((band) => band.includes("border-b-2")).length, 1);
});
