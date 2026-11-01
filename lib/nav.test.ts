import assert from "node:assert/strict";
import { test } from "node:test";
import { activeNavId, MOBILE_CHAT_SLOT, NAV_ITEMS, PRIMARY_NAV, switchesLanguageInPlace } from "./nav.ts";

// Invariants, not the milestone's menu: a new item or a new page must not need this test edited.
test("every nav item has a unique id and href and a label in both languages, and a soon item is never a link", () => {
  const ids = NAV_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  const hrefs = NAV_ITEMS.flatMap((item) => (item.href ? [item.href] : []));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const item of NAV_ITEMS) {
    assert.ok(item.label.hu.trim() && item.label.en.trim(), item.id);
    if (item.soon) assert.equal(item.href, null, item.id);
  }
});

// 2026-11-01 review. The sidebar holds three sections; every page belongs to one of them.
test("activeNavId puts each page under its section, by path prefix at segment boundaries", () => {
  assert.deepEqual(PRIMARY_NAV.map(({ id }) => id), ["radar", "search", "library"]);
  for (const path of ["/", "/daily", "/companies", "/github", "/github/"]) assert.equal(activeNavId(path), "radar", path);
  for (const path of ["/library", "/library/", "/library/42", "/archive", "/archive/2026-W38", "/collection"]) assert.equal(activeNavId(path), "library", path);
  for (const path of ["/libraryx", "/dailyx", "/login", "/dev/preview"]) assert.equal(activeNavId(path), null, path);
});

test("the toggle switches in place only where both languages are on the page", () => {
  for (const path of ["/", "/daily", "/companies", "/library", "/library/", "/archive", "/archive/2026-W38", "/dev/preview"]) {
    assert.equal(switchesLanguageInPlace(path), true, path);
  }
  for (const path of ["/library/42", "/archive/2026-W38/x", "/dev/preview/post", "/login"]) {
    assert.equal(switchesLanguageInPlace(path), false, path);
  }
});

// Kills a bar that isn't the three sections, with the taiyaki after the first two (Radar, Keresés).
test("the mobile bar holds the three sections, the taiyaki after the first two", () => {
  assert.deepEqual(PRIMARY_NAV.slice(0, MOBILE_CHAT_SLOT).map(({ id }) => id), ["radar", "search"]);
  assert.deepEqual(PRIMARY_NAV.slice(MOBILE_CHAT_SLOT).map(({ id }) => id), ["library"]);
});

test("the collection and the github repos switch language in place", () => {
  assert.equal(switchesLanguageInPlace("/collection"), true);
  assert.equal(switchesLanguageInPlace("/github"), true);
});
