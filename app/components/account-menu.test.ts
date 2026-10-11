import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { render } from "../../lib/test/render.ts";

const { AccountMenu, AccountMenuItems, AccountRows } = await import("./account-menu.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { RefreshProvider } = await import("./refresh-bar.tsx");
const { DropdownMenu: Menu } = await import("radix-ui");

const inProviders = (child: ReactNode) =>
  render(createElement(LanguageProvider, { initial: "hu" } as ComponentProps<typeof LanguageProvider>, createElement(RefreshProvider, null, child)));

// 2a spec D5. Kills the e-mail cut short (it is the one line that says who is signed in), a sign-out that
// isn't a POST form (a GET link could be prefetched), and a row missing.
test("the account rows show the whole e-mail, the language, the help and a POST sign-out", () => {
  const doc = inProviders(createElement(AccountRows, { email: "a-very-long-address@example.test", onHelp: () => {} }));
  assert.match(doc.body.textContent ?? "", /a-very-long-address@example\.test/);
  assert.equal(doc.querySelector('form[action="/auth/signout"]')?.getAttribute("method"), "post");
  assert.ok(doc.querySelector('button[aria-label="Switch to English"]'));
  assert.ok([...doc.querySelectorAll("button")].some((b) => /Billentyűparancsok/.test(b.textContent ?? "")));
  assert.equal(doc.querySelector("p")?.className.includes("truncate"), false);
});

// Final review #1 (WCAG 2.1.1). Kills the rows wrapped in one menu item: a Radix menu swallows Tab, so nothing
// inside that item could be reached from the keyboard. Each row is its own item (arrows, Enter, Esc): the
// language two radio items checked by the current one, the help an item, the sign-out the submit button of the
// POST form. The menu's content is rendered through the raw primitives, because the house content portals.
test("the account menu's rows are real menu items", () => {
  const doc = inProviders(
    createElement(
      Menu.Root,
      { open: true },
      createElement(Menu.Trigger, null, "t"),
      createElement(Menu.Content, null, createElement(AccountMenuItems, { email: "a@b.test", onHelp: () => {} })),
    ),
  );
  const radios = [...doc.querySelectorAll('[role="menuitemradio"]')].map((item) => [item.textContent, item.getAttribute("aria-checked")]);
  assert.deepEqual(radios, [
    ["Magyar", "true"],
    ["English", "false"],
  ]);
  const items = [...doc.querySelectorAll('[role="menuitem"]')];
  assert.equal(items.length, 2);
  assert.match(items[0]?.textContent ?? "", /Billentyűparancsok/);
  const form = doc.querySelector('form[action="/auth/signout"][method="post"]');
  assert.equal(items[1]?.getAttribute("type"), "submit");
  assert.equal(items[1]?.getAttribute("form"), form?.id);
  assert.match(doc.body.textContent ?? "", /a@b\.test/);
});

// Final review #13. Kills a trigger that reads "A a@b.test": its name says what it opens, in full and in the rail.
test("the account trigger is named Account with the address", () => {
  for (const iconOnly of [false, true]) {
    const doc = inProviders(createElement(AccountMenu, { email: "a@b.test", onHelp: () => {}, iconOnly }));
    assert.equal(doc.querySelector("button")?.getAttribute("aria-label"), "Fiók: a@b.test", `iconOnly ${iconOnly}`);
  }
});
