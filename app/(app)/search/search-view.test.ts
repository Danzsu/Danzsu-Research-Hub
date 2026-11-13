import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { previewSearchHits } from "../../../lib/search-fixtures.ts";
import { render } from "../../../lib/test/render.ts";

const { SearchView } = await import("./search-view.tsx");
const { LanguageProvider } = await import("../../components/language-context.tsx");

const view = (props: ComponentProps<typeof SearchView>) =>
  render(createElement(LanguageProvider, { initial: "en" } as ComponentProps<typeof LanguageProvider>, createElement(SearchView, props)));

// Kills a hit without its page link, an original link that opens in this tab or appears for a post, and the
// query lost from the field (a reload would search for nothing).
test("the search page lists each hit with its page, the original for a story and a repo, and keeps the query in the field", () => {
  const doc = view({ query: "cache", hits: previewSearchHits });
  assert.equal(doc.querySelector('input[name="q"]')?.getAttribute("value"), "cache");
  assert.deepEqual([...doc.querySelectorAll("li h2 a")].map((link) => link.getAttribute("href")), previewSearchHits.map((hit) => hit.href));
  const originals = [...doc.querySelectorAll('li a[target="_blank"]')];
  assert.deepEqual(originals.map((link) => link.getAttribute("href")), ["https://example.test/story", "https://github.com/owner/tool"]);
});

test("the search page says what to do for a short query, and when nothing matches", () => {
  assert.match(view({ query: "a", hits: [] }).body.textContent ?? "", /Type at least 2 characters/);
  assert.match(view({ query: "zzzz", hits: [] }).body.textContent ?? "", /No match/);
});
