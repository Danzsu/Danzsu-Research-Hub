import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../lib/test/render.ts";

const { CardToolbar } = await import("./card-toolbar.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { RatingsProvider } = await import("./rating-control.tsx");

const toolbar = (props: Partial<ComponentProps<typeof CardToolbar>> = {}) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "hu" } as ComponentProps<typeof LanguageProvider>,
      createElement(
        RatingsProvider,
        { send: async () => ({}) },
        createElement(CardToolbar, { itemId: "a", saved: false, hasTodo: false, rating: null, language: "hu", onToggleSaved: () => {}, onAddTodo: () => {}, ...props }),
      ),
    ),
  );

// 2a spec D1. Kills the toolbar losing one of its five buttons, the Later toggle not pressed when saved, the
// to-do button enabled once the item is a to-do, and a toolbar without its rating group. (That the unit never
// splits across lines is Playwright's check: ledger T2, T11.)
test("the card toolbar is one unit of the three ratings, Later and To-do", () => {
  const doc = toolbar({ saved: true, hasTodo: true });
  const unit = doc.querySelector("[data-card-toolbar]")!;
  assert.equal(unit.querySelectorAll("button").length, 5);
  assert.equal(unit.querySelector('button[aria-label="Később"]')?.getAttribute("aria-pressed"), "true");
  assert.equal(unit.querySelector('button[aria-label="Már a teendők között"]')?.hasAttribute("disabled"), true);
  assert.equal(doc.querySelector('[data-card-toolbar] [role="group"]') !== null, true);
});
