import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { assignIds } from "../../../lib/blocks.ts";
import { testPost } from "../../../lib/test/fixtures.ts";
import { render } from "../../../lib/test/render.ts";

const { PostEditor } = await import("./post-editor.tsx");

const blocks = assignIds([
  { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
  { type: "chapters", items: [{ seconds: 30, title: "Intro" }] },
  { type: "paragraph", content: [{ text: "Body" }] },
]);
const [video] = blocks;
const post = testPost({ kind: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", siteName: "YouTube", blocks, hiddenBlocks: [video.id] });

// What page.tsx passes in its edit branch: the page's own query, which always has edit=1 there.
const renderEditor = () => render(createElement(PostEditor, { post, language: "en", query: { edit: "1" } }));

test("PostEditor's hide toggles keep one constant label and report their state through aria-pressed", () => {
  const toggles = [...renderEditor().querySelectorAll("button[aria-pressed]")];
  assert.equal(toggles.length, blocks.length);
  assert.deepEqual(new Set(toggles.map((button) => button.getAttribute("aria-label"))), new Set(["Hide block"]));
  assert.deepEqual(toggles.map((button) => button.getAttribute("aria-pressed")), ["true", "false", "false"]);
});

test("PostEditor keeps edit mode in chapter links", () => {
  assert.equal(renderEditor().querySelector("nav a")!.getAttribute("href"), "?t=30&edit=1#video");
});

test("PostEditor labels each title and summary field through for/id, with the reset button outside the label", () => {
  const doc = renderEditor();
  const labels = [...doc.querySelectorAll("label")];
  const targets = labels.map((label) => {
    const field = doc.getElementById(label.getAttribute("for") ?? "");
    return [label.textContent, field?.tagName, field?.getAttribute("lang")];
  });
  assert.deepEqual(targets, [
    ["Title (HU)", "INPUT", "hu"],
    ["Summary (HU)", "TEXTAREA", "hu"],
    ["Title (EN)", "INPUT", "en"],
    ["Summary (EN)", "TEXTAREA", "en"],
  ]);
  for (const label of labels) assert.equal(label.querySelector("button"), null, label.textContent!);
  const resets = [...doc.querySelectorAll("button")].filter((button) => button.textContent === "Original");
  assert.deepEqual(resets.map((button) => button.getAttribute("aria-label")), [
    "Original title (HU)",
    "Original summary (HU)",
    "Original title (EN)",
    "Original summary (EN)",
  ]);
});

test("PostEditor mounts its live region empty, before any status text exists", () => {
  const status = renderEditor().querySelector('[role="status"]');
  assert.ok(status);
  assert.equal(status.textContent, "");
});
