import assert from "node:assert/strict";
import { test } from "node:test";
import { isMediaKey, variantPath } from "./media.ts";

// M1: the /media route downloads whatever isMediaKey accepts, so both of its anchors matter.
test("isMediaKey accepts exactly <source id>/<16 hex>-<width>.<avif|webp>", () => {
  const key = variantPath("12/0123456789abcdef", 640, "avif");
  assert.equal(isMediaKey(key), true);
  assert.equal(isMediaKey(variantPath("12/0123456789abcdef", 1280, "webp")), true);
  for (const bad of [`x${key}`, `../${key}`, `evil/${key}`, `${key}.png`, `${key}/x`, "12/0123456789ABCDEF-640.avif", "12/0123456789abcde-640.avif", "12/0123456789abcdef-640.svg", "12/0123456789abcdef.avif", ""]) {
    assert.equal(isMediaKey(bad), false, bad);
  }
});
