import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../../lib/test/render.ts";

const { default: AboutPage } = await import("./page.tsx");
const { default: PrivacyPage } = await import("../privacy/page.tsx");

// Kills the landing page without its sign-in (both forms, going home) or without the privacy link Google's
// consent screen points at, and a feature card dropped from the list.
test("the about page lists what the site does and carries both sign-in forms and the privacy link", async () => {
  const doc = render(await AboutPage());
  assert.equal(doc.querySelector("h1")?.textContent, "NEON NEWS RADAR//");
  assert.equal(doc.querySelectorAll("main ul li").length, 9);
  const forms = [...doc.querySelectorAll("form")].map((form) => [form.getAttribute("action"), form.querySelector('input[name="next"]')?.getAttribute("value")]);
  assert.deepEqual(forms, [["/auth/google", "/"], ["/auth/login", "/"]]);
  assert.ok([...doc.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/privacy"));
});

// Kills a privacy page without its sections, and the Google scopes claim drifting from what the app asks for.
test("the privacy page states what is stored, in both languages", async () => {
  const doc = render(await PrivacyPage());
  assert.equal(doc.querySelectorAll("main section").length, 5);
  assert.match(doc.body.textContent ?? "", /openid, az e-mail és a profil/);
});
