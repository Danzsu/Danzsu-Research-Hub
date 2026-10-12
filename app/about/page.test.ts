import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../../lib/test/render.ts";

const { default: AboutPage } = await import("./page.tsx");
const about = async (query: Record<string, string> = {}) => render(await AboutPage({ searchParams: Promise.resolve(query) }));
const { default: PrivacyPage } = await import("../privacy/page.tsx");

// Kills the landing page without its sign-in or without the privacy link Google's consent screen points at,
// a feature card dropped from the list, and the sign-in card back in the page: it lives in the header's sheet
// (portalled, so the forms never reach this markup), opened by the cream Belépés button.
test("the about page lists what the site does, opens sign-in from the header and links the privacy page", async () => {
  const doc = await about();
  assert.equal(doc.querySelector("h1")?.textContent, "NEON NEWS RADAR//");
  assert.ok([...doc.querySelectorAll("p")].some((line) => line.textContent === "INVITE-ONLY / CSAK MEGHÍVÓVAL"), "the hero's eyebrow");
  assert.equal(doc.querySelectorAll("main ul li").length, 9);
  assert.equal(doc.querySelectorAll("form").length, 0);
  const trigger = doc.querySelector('header button[aria-haspopup="dialog"]');
  assert.equal(trigger?.textContent, "Belépés");
  assert.match(trigger?.className ?? "", /\blift\b/);
  assert.ok([...doc.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/privacy"));
});

// Kills the radar glyph back beside the wordmark, and the credit line missing from the footer.
test("the public frame carries the logo and the credit line", async () => {
  const doc = await about();
  assert.match(doc.querySelector("header a[href='/about'] img")?.getAttribute("src") ?? "", /icon\.png/);
  assert.match(doc.querySelector("footer")?.textContent ?? "", /Made by Danzsu/);
});

// Kills a privacy page without its sections, and the Google scopes claim drifting from what the app asks for.
test("the privacy page states what is stored, in both languages", async () => {
  const doc = render(await PrivacyPage());
  assert.equal(doc.querySelectorAll("main section").length, 5);
  assert.match(doc.body.textContent ?? "", /openid, az e-mail és a profil/);
});

// 2a spec D6 and Review Focus 4. Kills the signed-out note missing, shown without the mark, or carried in the
// landing's own links.
test("the about page says you're signed out only on ?signed_out=1, and its links drop the mark", async () => {
  const marked = await about({ signed_out: "1" });
  assert.match(marked.querySelector('[role="status"]')?.textContent ?? "", /Kijelentkeztél/);
  assert.equal([...marked.querySelectorAll("a")].some((a) => a.getAttribute("href")?.includes("signed_out")), false);
  assert.equal((await about()).querySelector('[role="status"]'), null);
});
