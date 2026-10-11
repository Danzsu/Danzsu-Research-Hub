import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { previewGithubRepos } from "../../../lib/fixtures.ts";
import { render } from "../../../lib/test/render.ts";

const { GithubView } = await import("./github-view.tsx");
const { LanguageProvider } = await import("../../components/language-context.tsx");
const { RatingsProvider } = await import("../../components/rating-control.tsx");

const view = (props: ComponentProps<typeof GithubView>) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "hu" } as ComponentProps<typeof LanguageProvider>,
      createElement(RatingsProvider, { send: async () => ({}) }, createElement(GithubView, props)),
    ),
  );

// G1 spec 4. Kills a row without its repo link or its rating, a filter link that drops the other filter,
// the "more" link shown on the last page or not carrying the filters, the active filters left unmarked, and
// the weeks tab marked current.
test("the GitHub tab lists each repo with its rating, and its filter and more links keep the other filters", () => {
  const doc = view({ repos: previewGithubRepos, more: true, languages: ["C++", "Python"], filters: { rating: "heart", language: "Python", page: 1 } });
  assert.equal(doc.querySelectorAll("li").length, previewGithubRepos.length);
  assert.equal(doc.querySelectorAll('li [role="group"]').length, previewGithubRepos.length);
  assert.ok(doc.querySelector(`a[href="${previewGithubRepos[0].url}"]`));
  const hrefs = [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert.ok(hrefs.includes("/archive/github?rating=up&lang=Python"), "a rating chip keeps the language");
  assert.ok(hrefs.includes("/archive/github?rating=heart&lang=C%2B%2B"), "a language chip keeps the rating");
  assert.ok(hrefs.includes("/archive/github?rating=heart&lang=Python&page=2"), "more keeps both");
  const current = [...doc.querySelectorAll('nav a[aria-current="page"]')].map((a) => a.getAttribute("href"));
  assert.deepEqual(current, ["/archive/github", "/archive/github?rating=heart&lang=Python", "/archive/github?rating=heart&lang=Python"], "the tab, then the ❤ and Python chips");
  const last = view({ repos: previewGithubRepos, more: false, languages: [], filters: { page: 1 } });
  assert.equal([...last.querySelectorAll("a")].some((a) => a.getAttribute("href")?.includes("page=")), false);
});
