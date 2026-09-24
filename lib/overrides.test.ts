import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_HIDDEN_BLOCKS, readHiddenBlocks, readOverrides } from "./overrides.ts";

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

test("readHiddenBlocks rejects a non-array value", () => {
  for (const bad of ["b1", { "0": "b1" }, null, undefined, 5]) {
    assert.deepEqual(readHiddenBlocks(bad), []);
  }
});

test("readHiddenBlocks drops non-string entries", () => {
  assert.deepEqual(readHiddenBlocks(["b1", 2, null, "b2", { id: "b3" }]), ["b1", "b2"]);
});

test("readHiddenBlocks caps at the block limit", () => {
  const many = Array.from({ length: MAX_HIDDEN_BLOCKS + 50 }, (_, i) => `b${i}`);
  const result = readHiddenBlocks(many);
  assert.equal(result.length, MAX_HIDDEN_BLOCKS);
  assert.deepEqual(result, many.slice(0, MAX_HIDDEN_BLOCKS));
});
