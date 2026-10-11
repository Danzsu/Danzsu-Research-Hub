import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { render } from "../../lib/test/render.ts";

const { PageHero } = await import("./page-header.tsx");

// 2a spec D2 and Review Focus 3. Kills a title sized to the viewport (vw) instead of its own column (cqi), one
// that may break inside a word from sm up, and a lead that keeps its old top margin (the hero is lower now).
test("PageHero sizes its title to its column, breaks inside a word only below sm, and sits lower", () => {
  const doc = render(createElement(PageHero, { eyebrow: "E", title: "GYŰJTEMÉNY", lead: "lead" }));
  const h1 = doc.querySelector("h1")!;
  assert.match(h1.className, /cqi/);
  assert.doesNotMatch(h1.className, /vw/);
  assert.match(h1.className, /sm:\[overflow-wrap:normal\]/);
  assert.ok(h1.parentElement?.className.includes("@container"), "the title's column is the container");
  const band = doc.querySelector("section")?.className ?? "";
  assert.match(band, /\bpy-8\b/);
  assert.match(band, /\bsm:py-10\b/);
});
