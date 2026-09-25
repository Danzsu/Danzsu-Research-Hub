import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { testPost } from "../../../../lib/test/fixtures.ts";
import { render } from "../../../../lib/test/render.ts";

const { PostNotices } = await import("./post-notices.tsx");

const noticeText = (canEdit: boolean, lastError: string | null) =>
  render(createElement(PostNotices, { post: testPost({ lastError }), language: "en", originalHref: undefined, canEdit })).body.textContent ?? "";

test("PostNotices shows the last extraction error to the submitter only", () => {
  assert.match(noticeText(true, "fetch 404"), /re-extraction failed; the post stays as it was\. The error: fetch 404/);
  assert.equal(noticeText(false, "fetch 404"), "");
  assert.equal(noticeText(true, null), "");
});
