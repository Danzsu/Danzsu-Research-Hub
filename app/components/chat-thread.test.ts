import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { previewMySources } from "../../lib/fixtures.ts";
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

// Kills the kind's name read from anywhere but SOURCE_KIND_LABELS (the reply would say "arxiv"), a
// reply that ignores the status, and a post link to anything but /library/<postId>.
test("the thread greets first, then shows each submission oldest first with the reply its state calls for", () => {
  const doc = thread();
  const [greeting, done, failed, pending] = items(doc);
  assert.equal(items(doc).length, 1 + previewMySources.length);
  assert.match(greeting, /Dobj be egy linket!/);
  assert.match(done, /KÉSZ · MEGNYITÁS →/);
  assert.match(failed, /Nem sikerült feldolgozni\.fetch 404: /);
  assert.match(pending, /Megkaptam, arXiv-tanulmány\.FELDOLGOZÁS…/);
  assert.equal(doc.querySelector('a[href="/library/-1"]')?.textContent, "KÉSZ · MEGNYITÁS →");
  assert.match(items(thread({}, "en"))[3], /Got it: arXiv paper\.PROCESSING…/);
});

// Kills `disabled={retrying}`: a second click on "Újra" while the first is on its way.
test("a failed submission's ÚJRA button is disabled while its retry is on its way", () => {
  const retryButton = (retrying: number[]) => thread({ retrying }).querySelector("button")?.hasAttribute("disabled");
  assert.equal(retryButton([]), false);
  assert.equal(retryButton([-12]), true);
});

// Kills the reader's link rendered from the raw URL: a javascript: link would become clickable.
test("the reader's link opens in a new tab only when it is http(s); anything else stays text", () => {
  const doc = thread({ sources: [{ ...previewMySources[0], url: "javascript:alert(1)" }, previewMySources[1]] });
  const links = [...doc.querySelectorAll('a[target="_blank"]')];
  assert.deepEqual(links.map((link) => [link.getAttribute("href"), link.getAttribute("rel")]), [[previewMySources[1].url, "noreferrer"]]);
  assert.match(items(doc)[2], /javascript:alert\(1\)/);
});

// Kills a local reply with no text (a silent failure), the 409's post link shown without a post (or
// missing with one), and a sign-in link that loses the page to come back to.
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
    "Egyelőre csak linket tudok fogadni.",
    "Egyszerre egy linket tudok fogadni, az elsőt küldtem be.",
    "Ezt nem tudom megnyitni: csak nyilvános http(s) linket fogadok.",
    "Ezt már beküldte valaki.MEGNYITÁS →",
    "Ezt már beküldte valaki.",
    "Lejárt a belépésed.BELÉPÉS →",
    "Nem ment át, próbáld újra.",
    "Most nem érem el a beküldéseidet.",
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
