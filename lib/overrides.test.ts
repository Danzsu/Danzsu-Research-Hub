import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BLOCKS } from "./blocks.ts";
import { hiddenBlocksSchema, overridesSchema, readHiddenBlocks, readOverrides } from "./overrides.ts";

test("readOverrides ignores garbage types", () => {
  for (const garbage of [null, undefined, "not an object", 42, true]) {
    assert.deepEqual(readOverrides(garbage), {});
  }
});

test("readOverrides keeps valid fields and drops invalid ones", () => {
  const mixed = readOverrides({ title: { hu: "cím", en: "title" }, summary: 123 });
  assert.deepEqual(mixed, { title: { hu: "cím", en: "title" } });

  const both = readOverrides({ title: { hu: "a", en: "b" }, summary: { hu: "c", en: "d" } });
  assert.deepEqual(both, { title: { hu: "a", en: "b" }, summary: { hu: "c", en: "d" } });

  // A partial Localized (missing `en`) is invalid, not partially accepted.
  assert.deepEqual(readOverrides({ title: { hu: "only-hu" } }), {});
});

test("readOverrides drops an empty or over-length field instead of accepting it", () => {
  assert.deepEqual(readOverrides({ title: { hu: "", en: "title" } }), {});
  assert.deepEqual(readOverrides({ title: { hu: "x".repeat(301), en: "title" } }), {});
  assert.deepEqual(readOverrides({ summary: { hu: "", en: "s" } }), {});
  assert.deepEqual(readOverrides({ summary: { hu: "x".repeat(2001), en: "s" } }), {});
  // The boundary itself is still valid.
  const atLimit = readOverrides({ title: { hu: "x".repeat(300), en: "y".repeat(300) }, summary: { hu: "a".repeat(2000), en: "b".repeat(2000) } });
  assert.equal(atLimit.title?.hu.length, 300);
  assert.equal(atLimit.summary?.hu.length, 2000);
});

test("overridesSchema and hiddenBlocksSchema are the single source of truth readOverrides/readHiddenBlocks build on", () => {
  assert.equal(overridesSchema.safeParse({ title: { hu: "", en: "x" } }).success, false);
  assert.equal(overridesSchema.safeParse({ title: { hu: "x".repeat(301), en: "y" } }).success, false);
  assert.equal(overridesSchema.safeParse({ summary: { hu: "x".repeat(2001), en: "y" } }).success, false);
  assert.equal(overridesSchema.safeParse({}).success, true);
  assert.equal(overridesSchema.safeParse({ title: { hu: "a", en: "b" } }).success, true);

  assert.equal(hiddenBlocksSchema.safeParse(Array.from({ length: MAX_BLOCKS }, (_, i) => `b${i}`)).success, true);
  assert.equal(hiddenBlocksSchema.safeParse(Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => `b${i}`)).success, false);
});

test("readHiddenBlocks rejects a non-array value", () => {
  for (const bad of ["b1", { "0": "b1" }, null, undefined, 5]) {
    assert.deepEqual(readHiddenBlocks(bad), []);
  }
});

test("readHiddenBlocks drops non-string entries", () => {
  assert.deepEqual(readHiddenBlocks(["b1", 2, null, "b2", { id: "b3" }]), ["b1", "b2"]);
});

test("readHiddenBlocks caps at the shared block limit", () => {
  const many = Array.from({ length: MAX_BLOCKS + 50 }, (_, i) => `b${i}`);
  const result = readHiddenBlocks(many);
  assert.equal(result.length, MAX_BLOCKS);
  assert.deepEqual(result, many.slice(0, MAX_BLOCKS));
});
