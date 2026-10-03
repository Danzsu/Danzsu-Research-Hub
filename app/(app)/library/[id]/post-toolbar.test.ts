import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../../../lib/test/render.ts";

const { PostToolbar } = await import("./post-toolbar.tsx");
const { RefreshProvider } = await import("../../../components/refresh-bar.tsx");
const { LanguageProvider } = await import("../../../components/language-context.tsx");
const { RatingsProvider } = await import("../../../components/rating-control.tsx");

type Props = Parameters<typeof PostToolbar>[0];
// In the providers the app shell gives it: Translate refreshes through useRefresh, and the rating group
// reads the shell's language and rating store.
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
            hasTranslation: false,
            showingTranslation: false,
            canEdit: false,
            hasTranslatable: true,
            rating: null,
            ...props,
          }),
        ),
      ),
    ),
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
  // Its failure line's alert region (ErrorLine), mounted before any failure so the change is announced.
  assert.equal(doc.querySelector('[role="alert"]')?.textContent, "");
});

// G1 spec 3. Kills the post's rating group missing from the toolbar, or not drawn from the page's rating.
test("PostToolbar carries the post's rating group, pressed by its rating", () => {
  const doc = renderToolbar({ rating: 1 });
  assert.equal(doc.querySelector('[role="group"][aria-label="Rating"]')?.getAttribute("data-rating"), "up");
  assert.equal(doc.querySelector('button[aria-label="Useful"]')?.getAttribute("aria-pressed"), "true");
});
