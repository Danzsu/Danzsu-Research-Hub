import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../lib/test/render.ts";

const { AccountRows } = await import("./account-menu.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { RefreshProvider } = await import("./refresh-bar.tsx");

// 2a spec D5. Kills the e-mail cut short (it is the one line that says who is signed in), a sign-out that
// isn't a POST form (a GET link could be prefetched), and a row missing.
test("the account rows show the whole e-mail, the language, the help and a POST sign-out", () => {
  const doc = render(
    createElement(
      LanguageProvider,
      { initial: "hu" } as ComponentProps<typeof LanguageProvider>,
      createElement(RefreshProvider, null, createElement(AccountRows, { email: "a-very-long-address@example.test", onHelp: () => {} })),
    ),
  );
  assert.match(doc.body.textContent ?? "", /a-very-long-address@example\.test/);
  assert.equal(doc.querySelector('form[action="/auth/signout"]')?.getAttribute("method"), "post");
  assert.ok(doc.querySelector('button[aria-label="Switch to English"]'));
  assert.ok([...doc.querySelectorAll("button")].some((b) => /Billentyűparancsok/.test(b.textContent ?? "")));
  assert.equal(doc.querySelector("p")?.className.includes("truncate"), false);
});
