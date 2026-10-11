import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { previewFavorites } from "../../../lib/fixtures.ts";
import { render } from "../../../lib/test/render.ts";

const { CollectionView } = await import("./collection-view.tsx");
const { LanguageProvider } = await import("../../components/language-context.tsx");
const { RatingsProvider } = await import("../../components/rating-control.tsx");

const view = (props: ComponentProps<typeof CollectionView>) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "hu" } as ComponentProps<typeof LanguageProvider>,
      createElement(RatingsProvider, { send: async () => ({}) }, createElement(CollectionView, props)),
    ),
  );

// G1 spec 5. Kills the kind filter ignored, a row without its heart (it could never be taken back),
// a Library post opened in a new tab or a news item or repo in this one, and a missing empty state.
test("the collection lists the hearts by kind, each with its rating group pressed on the heart", () => {
  const all = view({ favorites: previewFavorites });
  assert.equal(all.querySelectorAll("li").length, previewFavorites.length);
  assert.equal(all.querySelectorAll('li [role="group"][data-rating="heart"]').length, previewFavorites.length);
  assert.equal(all.querySelectorAll('li a[target="_blank"]').length, previewFavorites.filter((favorite) => favorite.external).length);
  const posts = view({ favorites: previewFavorites, kind: "post" });
  assert.deepEqual([...posts.querySelectorAll("li a")].map((a) => [a.getAttribute("href")?.startsWith("/library/"), a.getAttribute("target")]), [[true, null]]);
  assert.equal(view({ favorites: [] }).querySelectorAll("li").length, 0);
  assert.match(view({ favorites: [] }).body.textContent ?? "", /Még nincs kedvenced/);
});
