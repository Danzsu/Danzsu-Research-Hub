import assert from "node:assert/strict";
import { test } from "node:test";
import { readNavMode } from "./nav-mode.ts";

test("rail only for the exact cookie value", () => {
  assert.equal(readNavMode("rail"), "rail");
});

test("anything else means full: missing, garbled, or another value", () => {
  for (const value of [undefined, "", "full", "RAIL", "rail ", "expanded"]) {
    assert.equal(readNavMode(value), "full", String(value));
  }
});
