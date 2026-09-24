import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateAddress, isoWeek, isoWeekMonday, itemId, parseSubmittedUrl, publishedLabel, slugify, sourceKind } from "./util.ts";

test("isoWeek handles year boundaries", () => {
  assert.equal(isoWeek(new Date("2026-09-23T10:00:00Z")).id, "2026-W39");
  assert.equal(isoWeek(new Date("2027-01-01T00:00:00Z")).id, "2026-W53"); // Friday → previous ISO year
  assert.equal(isoWeek(new Date("2024-12-30T00:00:00Z")).id, "2025-W01"); // Monday → next ISO year
  assert.equal(isoWeek(new Date("2026-09-27T23:00:00Z")).monday.toISOString().slice(0, 10), "2026-09-21");
});

test("isoWeekMonday inverts isoWeek and rejects bad ids", () => {
  assert.equal(isoWeekMonday("2026-W39")?.toISOString().slice(0, 10), "2026-09-21");
  assert.equal(isoWeekMonday("2025-W01")?.toISOString().slice(0, 10), "2024-12-30");
  assert.equal(isoWeekMonday("2026-W53")?.toISOString().slice(0, 10), "2026-12-28");
  for (let day = 0; day < 800; day += 3) {
    const week = isoWeek(new Date(Date.UTC(2025, 0, 1 + day)));
    assert.equal(isoWeekMonday(week.id)?.getTime(), week.monday.getTime(), week.id);
  }
  for (const bad of ["2025-W53", "2026-W00", "2026-W54", "2026-39", "../etc", ""]) {
    assert.equal(isoWeekMonday(bad), null, bad);
  }
});

test("itemId is stable, bounded, and URL-unique", () => {
  const week = isoWeek(new Date("2026-09-23T00:00:00Z"));
  const a = itemId("research", week, "Árvíztűrő Tükörfúrógép: New LLM!", "https://a.example/1");
  assert.match(a, /^research-2026w39-arvizturo-tukorfurogep-new-llm-[0-9a-f]{6}$/);
  assert.equal(a, itemId("research", week, "Árvíztűrő Tükörfúrógép: New LLM!", "https://a.example/1"));
  assert.notEqual(a, itemId("research", week, "Árvíztűrő Tükörfúrógép: New LLM!", "https://a.example/2"));
  assert.ok(itemId("local", week, "x".repeat(500), "u").length <= 120);
  assert.equal(slugify("---"), "");
});

test("parseSubmittedUrl rejects internal and non-http targets", () => {
  assert.equal(parseSubmittedUrl("https://example.com/a#frag")?.toString(), "https://example.com/a");
  for (const bad of ["ftp://x.com", "http://localhost:3000", "http://127.0.0.1", "http://192.168.1.2", "http://[::1]/", "not a url", "http://intranet"]) {
    assert.equal(parseSubmittedUrl(bad), null, bad);
  }
});

test("isPrivateAddress covers v4, v6 and mapped forms", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.1", "192.168.0.1", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "140.82.112.3", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("sourceKind and publishedLabel", () => {
  assert.equal(sourceKind(new URL("https://youtu.be/abc")), "youtube");
  assert.equal(sourceKind(new URL("https://m.youtube.com/watch?v=abc")), "youtube");
  assert.equal(sourceKind(new URL("https://blog.example.com/post")), "article");
  assert.equal(publishedLabel("2026-09-22"), "09 / 22");
});
