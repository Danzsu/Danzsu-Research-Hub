import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../lib/test/render.ts";

const { RepoCard } = await import("./repo-card.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { RatingsProvider } = await import("./rating-control.tsx");

const card = (props: ComponentProps<typeof RepoCard>) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "hu" } as ComponentProps<typeof LanguageProvider>,
      createElement(RatingsProvider, { send: async () => ({}) }, createElement(RepoCard, props)),
    ),
  );

// Spec 2.2. Kills the rating group left outside the card, the card made a link (a button in a link), the
// name not linking to the repo in a new tab, and the rank shown when there is none.
test("a repo card holds its rating group inside, links only its name, and shows a rank only when given", () => {
  const doc = card({ rank: 3, repo: "Owner/Repo", url: "https://github.com/Owner/Repo", focus: "A tool", meta: "Rust · ★ 42 · 88/100", target: { kind: "repo", id: "owner/repo" }, initial: 2 });
  const article = doc.querySelector("article")!;
  assert.equal(article.querySelectorAll('[role="group"][data-rating="heart"]').length, 1);
  const links = [...article.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.getAttribute("target"), a.textContent?.trim()]);
  assert.deepEqual(links, [["https://github.com/Owner/Repo", "_blank", "Owner/Repo"]]);
  assert.equal(article.querySelectorAll('a [role="group"]').length, 0);
  assert.match(article.textContent ?? "", /03/);
  assert.match(article.textContent ?? "", /Rust · ★ 42 · 88\/100/);
  const plain = card({ repo: "a/b", url: "https://github.com/a/b", focus: "", meta: "—", target: { kind: "repo", id: "a/b" }, initial: null });
  assert.doesNotMatch(plain.querySelector("article")?.textContent ?? "", /0\d/);
});
