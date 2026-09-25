import assert from "node:assert/strict";
import { test } from "node:test";
import { activeNavId, NAV_ITEMS, PRIMARY_NAV, SOON_NAV, switchesLanguageInPlace } from "./nav.ts";

test("the bar's four primary slots in order, then the soon items", () => {
  assert.deepEqual(PRIMARY_NAV.map((item) => item.id), ["radar", "library", "search", "archive"]);
  assert.deepEqual(SOON_NAV.map((item) => item.id), ["collection", "stats", "chat"]);
  assert.equal(PRIMARY_NAV.length + SOON_NAV.length, NAV_ITEMS.length);
});

test("only real pages are links in milestone A", () => {
  // Search opens the palette slot until milestone C adds /search; the soon items are inert.
  assert.deepEqual(NAV_ITEMS.filter((item) => item.href).map((item) => item.href), ["/", "/library", "/archive"]);
});

test("activeNavId goes by path prefix at segment boundaries", () => {
  assert.equal(activeNavId("/"), "radar");
  assert.equal(activeNavId("/archive"), "archive");
  assert.equal(activeNavId("/archive/2026-W38"), "archive");
  assert.equal(activeNavId("/library/42"), "library");
  assert.equal(activeNavId("/library/"), "library");
  assert.equal(activeNavId("/libraryx"), null);
  assert.equal(activeNavId("/login"), null);
  assert.equal(activeNavId("/dev/preview"), null);
});

test("the toggle switches in place only where both languages are on the page", () => {
  for (const path of ["/", "/library", "/library/", "/archive", "/archive/2026-W38", "/dev/preview"]) {
    assert.equal(switchesLanguageInPlace(path), true, path);
  }
  for (const path of ["/library/42", "/archive/2026-W38/x", "/dev/preview/post", "/login"]) {
    assert.equal(switchesLanguageInPlace(path), false, path);
  }
});
