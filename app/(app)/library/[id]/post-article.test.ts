import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { testPost } from "../../../../lib/test/fixtures.ts";
import { render } from "../../../../lib/test/render.ts";

const { PostArticle } = await import("./post-article.tsx");

const renderArticle = (post = testPost()) => render(createElement(PostArticle, { post, language: "en", query: {}, canEdit: false }));

test("the post column is the widened frame, not the old narrow one", () => {
  const wrapper = renderArticle().querySelector("article > div")!;
  assert.ok(wrapper.classList.contains("max-w-6xl"), wrapper.className);
  assert.equal(wrapper.classList.contains("max-w-3xl"), false);
});

test("the summary and key points stay at the readable prose width", () => {
  const post = testPost({ keyPoints: { hu: [], en: ["First point"] } });
  const doc = renderArticle(post);
  const summary = [...doc.querySelectorAll("p")].find((p) => p.textContent === post.summary.en)!;
  assert.ok(summary.classList.contains("max-w-[75ch]"), summary.className);
  const keyPointsBlock = doc.querySelector("ul")!.closest("div")!;
  assert.ok(keyPointsBlock.classList.contains("max-w-[75ch]"), keyPointsBlock.className);
});
