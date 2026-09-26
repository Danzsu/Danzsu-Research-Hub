import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { LONG_URL, LONG_WORD, previewMySources } from "../../lib/fixtures.ts";
import type { ChatNotice } from "../../lib/link-chat.ts";
import { render } from "../../lib/test/render.ts";

const { ChatThread } = await import("./chat-thread.tsx");
const { TaiyakiIcon } = await import("./taiyaki-icon.tsx");

type Snapshot = ComponentProps<typeof ChatThread>["snapshot"];

/** The thread on the preview's three submissions, in Hungarian unless `language` says otherwise. */
const thread = (snapshot: Partial<Snapshot> = {}, language: "hu" | "en" = "hu") =>
  render(
    createElement(ChatThread, {
      language,
      loginHref: "/login?next=%2Flibrary",
      onRetry: () => {},
      snapshot: { sources: previewMySources, notices: [], unreachable: false, retrying: [], ...snapshot },
    }),
  );

const items = (doc: Document) => [...doc.querySelectorAll("ol > li")].map((item) => item.textContent ?? "");
/** Only the ÚJRA buttons carry aria-disabled (M2): a plain `querySelector("button")` would stop
 *  uniquely identifying it once more than one is on the page. */
const retryButtons = (doc: Document) => [...doc.querySelectorAll("button[aria-disabled]")];

// Kills the kind's name read from anywhere but SOURCE_KIND_LABELS (the reply would say "arxiv"), a
// reply that ignores the status, a post link to anything but /library/<postId>, either sr-only
// speaker prefix (I2b) dropped or run into the text after it with no space, the note line dropped,
// the done title's <p> dropped, and reply.title[language] pinned to .hu regardless of the render's
// own language (M1).
test("the thread greets first, then shows each submission oldest first with the reply its state calls for", () => {
  const doc = thread();
  const [greeting, done, failed, pending] = items(doc);
  assert.equal(items(doc).length, 1 + previewMySources.length);
  assert.match(greeting, /Dobj be egy linket!/);
  assert.equal(done, `Te: https://example.test/posts/-1Hosszú megjegyzés: ${LONG_WORD}Taiyaki: ${LONG_WORD} – készKÉSZ · MEGNYITÁS →`);
  assert.equal(failed, `Te: ${LONG_URL}Taiyaki: Nem sikerült feldolgozni.fetch 404: ${LONG_URL}ÚJRA`);
  assert.equal(pending, "Te: https://arxiv.org/abs/2609.01234A módszertan-részre figyelj.Taiyaki: Megkaptam, arXiv-tanulmány.FELDOLGOZÁS…");
  assert.equal(doc.querySelector('a[href="/library/-1"]')?.textContent, "KÉSZ · MEGNYITÁS →");
  const en = items(thread({}, "en"));
  assert.equal(en[3], "You: https://arxiv.org/abs/2609.01234A módszertan-részre figyelj.Taiyaki: Got it: arXiv paper.PROCESSING…");
  assert.ok(en[1].includes(`${LONG_WORD} – done`), en[1]);
});

// Kills `aria-disabled={retrying}` losing its guard, and the retrying label falling back to the same
// text either way: the button must show the in-flight label and read aria-disabled only while its
// own retry is on its way (M2 — plain `disabled` would drop keyboard focus).
test("a failed submission's ÚJRA button shows the in-flight label and is aria-disabled while its retry is on its way", () => {
  const button = (retrying: number[]) => retryButtons(thread({ retrying }))[0];
  assert.deepEqual([button([])?.getAttribute("aria-disabled"), button([])?.textContent], ["false", "ÚJRA"]);
  assert.deepEqual([button([-12])?.getAttribute("aria-disabled"), button([-12])?.textContent], ["true", "ÚJRA…"]);
});

// Kills `retrying.includes(entry.id)` → `retrying.length > 0` (M1): only the retrying source's own
// button may show the in-flight state, not every ÚJRA button on the page.
test("only the retrying source's ÚJRA button is in-flight; a different id's button is untouched", () => {
  const failedA = { ...previewMySources[1], id: -21, url: "https://a.test/fail" };
  const failedB = { ...previewMySources[1], id: -22, url: "https://b.test/fail" };
  const doc = thread({ sources: [failedA, failedB], retrying: [-21] });
  const buttonNear = (url: string) => {
    const li = [...doc.querySelectorAll("li")].find((item) => (item.textContent ?? "").includes(url));
    return li?.querySelector("button[aria-disabled]");
  };
  assert.equal(buttonNear("https://a.test/fail")?.getAttribute("aria-disabled"), "true");
  assert.equal(buttonNear("https://b.test/fail")?.getAttribute("aria-disabled"), "false");
});

// Kills the reader's link rendered from the raw URL (a javascript: link would become clickable), and
// the ExternalLink cue dropped from an actual http(s) link (M5).
test("the reader's link opens in a new tab with an external-link cue only when it is http(s); anything else stays text", () => {
  const doc = thread({ sources: [{ ...previewMySources[0], url: "javascript:alert(1)" }, previewMySources[1]] });
  const links = [...doc.querySelectorAll('a[target="_blank"]')];
  assert.deepEqual(links.map((link) => [link.getAttribute("href"), link.getAttribute("rel")]), [[previewMySources[1].url, "noreferrer"]]);
  assert.ok(links[0].querySelector("svg"));
  assert.match(items(doc)[2], /javascript:alert\(1\)/);
});

// Kills a local reply with no text (a silent failure), the 409's post link shown without a post (or
// missing with one), a sign-in link that loses the page to come back to, and the "Taiyaki:" sr-only
// prefix dropped from a local reply (I2b).
test("every local reply says what happened, with the post link and the sign-in link where they belong", () => {
  const notices: ChatNotice[] = [
    { kind: "no_link" },
    { kind: "more_links" },
    { kind: "invalid_url" },
    { kind: "already_submitted", postId: 9 },
    { kind: "already_submitted", postId: null },
    { kind: "signed_out" },
    { kind: "network" },
  ];
  const doc = thread({ sources: [], notices, unreachable: true });
  assert.deepEqual(items(doc).slice(1), [
    "Taiyaki: Egyelőre csak linket tudok fogadni.",
    "Taiyaki: Egyszerre egy linket tudok fogadni, az elsőt küldtem be.",
    "Taiyaki: Ezt nem tudom megnyitni: csak nyilvános http(s) linket fogadok.",
    "Taiyaki: Ezt már beküldte valaki.MEGNYITÁS →",
    "Taiyaki: Ezt már beküldte valaki.",
    "Taiyaki: Lejárt a belépésed.BELÉPÉS →",
    "Taiyaki: Nem ment át, próbáld újra.",
    "Taiyaki: Most nem érem el a beküldéseidet.",
  ]);
  assert.equal(doc.querySelectorAll('a[href^="/library/"]').length, 1);
  assert.equal(doc.querySelector('a[href="/library/9"]')?.textContent, "MEGNYITÁS →");
  assert.equal(doc.querySelector('a[href="/login?next=%2Flibrary"]')?.textContent, "BELÉPÉS →");
});

// Kills the live region dropped: a screen reader would never hear a reply arrive.
test("the thread is a polite live region, and the taiyaki inside it is decorative", () => {
  const doc = thread();
  assert.equal(doc.querySelector("ol")?.getAttribute("aria-live"), "polite");
  const icon = render(createElement(TaiyakiIcon, { className: "size-6" })).querySelector("svg");
  assert.deepEqual([icon?.getAttribute("aria-hidden"), icon?.getAttribute("viewBox")], ["true", "0 0 64 64"]);
});

// I1: "FELDOLGOZÁS…" reads as plain status text, not a link — DESIGN.md → Colors reserves the
// underline for something clickable, and this label opens nothing.
test("the processing label isn't styled like a link", () => {
  const doc = thread();
  const label = [...doc.querySelectorAll("p")].find((p) => (p.textContent ?? "").includes("FELDOLGOZÁS"))?.querySelector("span:last-child");
  assert.equal(label?.classList.contains("underline"), false);
  assert.equal(label?.classList.contains("text-ink/70"), true);
});

// M3: while nothing has loaded yet, exactly one "loading" taiyaki shows, and it never sits beside a
// local reply or the unreachable line, nor lingers once a list — even an empty one — has landed.
test("a loading taiyaki shows only until the thread has actually loaded, never beside a notice or the unreachable line", () => {
  const loading = items(thread({ sources: null }));
  assert.equal(loading.length, 2);
  assert.match(loading[1], /BETÖLTÉS…/);

  assert.equal(items(thread({ sources: [] })).length, 1);
  assert.doesNotMatch(items(thread({ sources: null, notices: [{ kind: "signed_out" }] })).join(""), /BETÖLTÉS…/);
  assert.doesNotMatch(items(thread({ sources: null, unreachable: true })).join(""), /BETÖLTÉS…/);
});
