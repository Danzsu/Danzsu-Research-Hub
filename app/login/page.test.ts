import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../../lib/test/render.ts";

// render.ts's loader also resolves @/lib/supabase/server (the page's safeNext) to the route stub.
const { default: LoginPage } = await import("./page.tsx");
const page = async (query: Record<string, string>) => render(await LoginPage({ searchParams: Promise.resolve(query) }));

// Google sign-in spec. Kills the Google form dropped or put after the email form, either form losing the
// safe next, and the button's text changed.
test("the login page offers Google first, then the email link, both carrying the safe next", async () => {
  const doc = await page({ next: "/library?x=1" });
  const forms = [...doc.querySelectorAll("form")].map((form) => [form.getAttribute("action"), form.querySelector('input[name="next"]')?.getAttribute("value")]);
  assert.deepEqual(forms, [["/auth/google", "/library?x=1"], ["/auth/login", "/library?x=1"]]);
  assert.ok(doc.querySelector('header a[href="/about"]'), "the login page sits in the public frame (2a spec D6)");
  // The page is the sign-in itself: no header button opening a second one (2a final review #15).
  assert.equal(doc.querySelector('header button[aria-haspopup="dialog"], header a[href="/login"]'), null);
  assert.match(doc.querySelector('form[action="/auth/google"] button')?.textContent ?? "", /Belépés Google-lel \/ Continue with Google/);
  const evil = await page({ next: "//evil.test" });
  assert.deepEqual([...evil.querySelectorAll('input[name="next"]')].map((input) => input.getAttribute("value")), ["/", "/"]);
});

// Review Focus 4. Kills a reason shown with the wrong text, an unknown reason shown as nothing, and an
// alert region that only mounts with an error.
test("the login page says why a sign-in failed, in both languages, in its alert region", async () => {
  const expired = "A link lejárt vagy érvénytelen. / The link expired or is invalid.";
  const cases: [string, string][] = [
    ["not_invited", "Ez a Google-fiók nincs meghívva. / This Google account isn't invited."],
    ["google", "A Google-belépés nem sikerült, próbáld újra. / Google sign-in failed, try again."],
    ["1", expired],
    ["valami", expired],
    // Polish 4, Review Focus 1: a hand-made code that names an Object.prototype member.
    ["constructor", expired],
    ["toString", expired],
    ["__proto__", expired],
  ];
  for (const [error, text] of cases) assert.equal((await page({ error })).querySelector('[role="alert"]')?.textContent, text, error);
  assert.equal((await page({})).querySelector('[role="alert"]')?.textContent, "");
});

// Kills the sent state that still shows a form (a second link, or a Google sign-in mid-wait).
test("after a link is sent, the page shows only that note", async () => {
  const doc = await page({ sent: "1" });
  assert.equal(doc.querySelectorAll("form").length, 0);
  assert.match(doc.body.textContent ?? "", /a belépő link úton van/);
});
