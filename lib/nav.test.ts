import assert from "node:assert/strict";
import { test } from "node:test";
import { activeNavId, inMobileMore, MOBILE_BAR_NAV, MOBILE_MORE_NAV, NAV_ITEMS, PRIMARY_NAV, switchesLanguageInPlace } from "./nav.ts";

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

test("activeNavId goes by path prefix at segment boundaries", () => {
  assert.equal(activeNavId("/"), "radar");
  assert.equal(activeNavId("/daily"), "daily");
  assert.equal(activeNavId("/companies"), "companies");
  assert.equal(activeNavId("/archive"), "archive");
  assert.equal(activeNavId("/archive/2026-W38"), "archive");
  assert.equal(activeNavId("/github"), "github");
  assert.equal(activeNavId("/collection"), "collection");
  assert.equal(activeNavId("/library/42"), "library");
  assert.equal(activeNavId("/library/"), "library");
  assert.equal(activeNavId("/libraryx"), null);
  assert.equal(activeNavId("/login"), null);
  assert.equal(activeNavId("/dev/preview"), null);
});

test("the toggle switches in place only where both languages are on the page", () => {
  for (const path of ["/", "/daily", "/companies", "/library", "/library/", "/archive", "/archive/2026-W38", "/dev/preview"]) {
    assert.equal(switchesLanguageInPlace(path), true, path);
  }
  for (const path of ["/library/42", "/archive/2026-W38/x", "/dev/preview/post", "/login"]) {
    assert.equal(switchesLanguageInPlace(path), false, path);
  }
});

// Kills wrong list contents (a bar that isn't three page slots, a primary item in neither list or in
// both) and an inMobileMore that marks the wrong pages.
test("the mobile bar holds three page slots, Több holds every other primary item, and marks their pages", () => {
  assert.equal(MOBILE_BAR_NAV.length, 3);
  assert.deepEqual(MOBILE_BAR_NAV.map(({ id }) => id), ["radar", "daily", "library"]);
  assert.equal(inMobileMore("search"), true);
  assert.deepEqual([...MOBILE_BAR_NAV, ...MOBILE_MORE_NAV].map(({ id }) => id).sort(), PRIMARY_NAV.map(({ id }) => id).sort());
  assert.equal(inMobileMore(activeNavId("/archive/2026-W38")), true);
  assert.equal(inMobileMore(activeNavId("/companies")), true);
  assert.equal(inMobileMore(activeNavId("/collection")), true);
  assert.equal(inMobileMore(activeNavId("/github")), true);
  assert.equal(inMobileMore(activeNavId("/library/42")), false);
  assert.equal(inMobileMore(null), false);
});

// G1 spec 5. Kills the collection left "soon" (an inert row), or kept off the mobile "Több".
test("the collection is a live page in the mobile Több sheet", () => {
  const collection = NAV_ITEMS.find((item) => item.id === "collection");
  assert.deepEqual([collection?.href, collection?.soon, collection?.mobileMore], ["/collection", undefined, true]);
  assert.equal(switchesLanguageInPlace("/collection"), true);
});

// Spec 2.3. Kills the GitHub list left under the archive, or kept off the mobile Több.
test("the github repos are a live page in the mobile Több sheet, switching language in place", () => {
  const github = NAV_ITEMS.find((item) => item.id === "github");
  assert.deepEqual([github?.href, github?.soon, github?.mobileMore], ["/github", undefined, true]);
  assert.equal(switchesLanguageInPlace("/github"), true);
});
