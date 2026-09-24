import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { render } from "../../../lib/test/render.ts";

const { PostToolbar } = await import("./post-toolbar.tsx");

type Props = Parameters<typeof PostToolbar>[0];
const renderToolbar = (props: Partial<Props>) =>
  render(
    createElement(PostToolbar, {
      postId: 7,
      language: "en",
      hasTranslation: false,
      showingTranslation: false,
      canEdit: false,
      hasTranslatable: true,
      ...props,
    }),
  );
const translateButton = (doc: Document) => [...doc.querySelectorAll("button")].find((button) => button.textContent?.includes("Translate to Hungarian"));

test("PostToolbar offers translation only when the post has translatable text and no translation yet", () => {
  assert.ok(translateButton(renderToolbar({})));
  assert.equal(translateButton(renderToolbar({ hasTranslatable: false })), undefined);
  assert.equal(translateButton(renderToolbar({ hasTranslation: true })), undefined);
});

test("PostToolbar switches between the original and the translation once one exists", () => {
  const doc = renderToolbar({ hasTranslation: true, showingTranslation: true });
  const links = [...doc.querySelectorAll('[role="group"] a')];
  assert.deepEqual(links.map((a) => [a.getAttribute("href"), a.getAttribute("aria-current")]), [
    ["/library/7", "false"],
    ["/library/7?text=hu", "true"],
  ]);
});

test("PostToolbar shows the edit link to the submitter only, and always mounts its live region", () => {
  const edit = (doc: Document) => doc.querySelector('a[href="/library/7?edit=1"]');
  assert.equal(edit(renderToolbar({})), null);
  const doc = renderToolbar({ canEdit: true });
  assert.ok(edit(doc));
  assert.equal(doc.querySelector('[role="status"]')?.textContent, "");
});
