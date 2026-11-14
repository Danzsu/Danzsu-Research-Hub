import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../../../lib/test/render.ts";

const { PostToolbar } = await import("./post-toolbar.tsx");
const { RefreshProvider } = await import("../../../components/refresh-bar.tsx");
const { LanguageProvider } = await import("../../../components/language-context.tsx");
const { RatingsProvider } = await import("../../../components/rating-control.tsx");

type Props = Parameters<typeof PostToolbar>[0];
// In the providers the app shell gives it: the rating group reads the shell's language and rating store.
const renderToolbar = (props: Partial<Props>) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "en" } as ComponentProps<typeof LanguageProvider>,
      createElement(
        RatingsProvider,
        { send: async () => ({}) },
        createElement(
          RefreshProvider,
          null,
          createElement(PostToolbar, {
            postId: 7,
            language: "en",
            canEdit: false,
            rating: null,
            ...props,
          }),
        ),
      ),
    ),
  );
test("PostToolbar shows the edit link to the submitter only", () => {
  const edit = (doc: Document) => doc.querySelector('a[href="/library/7?edit=1"]');
  assert.equal(edit(renderToolbar({})), null);
  assert.ok(edit(renderToolbar({ canEdit: true })));
});

// G1 spec 3. Kills the post's rating group missing from the toolbar, or not drawn from the page's rating.
test("PostToolbar carries the post's rating group, pressed by its rating", () => {
  const doc = renderToolbar({ rating: 1 });
  assert.equal(doc.querySelector('[role="group"][aria-label="Rating"]')?.getAttribute("data-rating"), "up");
  assert.equal(doc.querySelector('button[aria-label="Useful"]')?.getAttribute("aria-pressed"), "true");
});
