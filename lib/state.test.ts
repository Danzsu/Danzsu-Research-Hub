import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStateAction } from "./state.ts";

test("parseStateAction accepts set_read and set_saved, capping the item id at 120 characters", () => {
  assert.deepEqual(parseStateAction({ action: "set_read", itemId: "local-2026w39-x-abc123", value: true }), {
    action: "set_read",
    itemId: "local-2026w39-x-abc123",
    value: true,
  });
  assert.deepEqual(parseStateAction({ action: "set_saved", itemId: "x".repeat(200), value: false }), {
    action: "set_saved",
    itemId: "x".repeat(120),
    value: false,
  });
});

test("parseStateAction treats any flag other than true as false, for every action that takes one", () => {
  for (const value of [undefined, "true", 1, null]) {
    for (const action of ["set_read", "set_saved"] as const) {
      assert.deepEqual(parseStateAction({ action, itemId: "i", value }), { action, itemId: "i", value: false }, `${action} ${String(value)}`);
    }
    assert.deepEqual(parseStateAction({ action: "set_todo", id: 3, value }), { action: "set_todo", id: 3, value: false }, String(value));
  }
});

test("parseStateAction trims and caps a to-do's text, and links it to an item only when one is given", () => {
  assert.deepEqual(parseStateAction({ action: "add_todo", text: "  read the paper  " }), { action: "add_todo", text: "read the paper", itemId: null });
  assert.deepEqual(parseStateAction({ action: "add_todo", text: "t", itemId: "" }), { action: "add_todo", text: "t", itemId: null });
  assert.deepEqual(parseStateAction({ action: "add_todo", text: "t", itemId: "item-1" }), { action: "add_todo", text: "t", itemId: "item-1" });
  assert.deepEqual(parseStateAction({ action: "add_todo", text: "t", itemId: "z".repeat(200) }), { action: "add_todo", text: "t", itemId: "z".repeat(120) });
  assert.deepEqual(parseStateAction({ action: "add_todo", text: "y".repeat(300) }), { action: "add_todo", text: "y".repeat(180), itemId: null });
});

test("parseStateAction accepts set_todo and delete_todo with an integer id", () => {
  assert.deepEqual(parseStateAction({ action: "set_todo", id: 7, value: true }), { action: "set_todo", id: 7, value: true });
  assert.deepEqual(parseStateAction({ action: "delete_todo", id: 7 }), { action: "delete_todo", id: 7 });
});

test("parseStateAction answers each malformed body with the route's error code", () => {
  const cases: [unknown, string][] = [
    [{ action: "set_read" }, "missing_item"],
    [{ action: "set_saved", itemId: "" }, "missing_item"],
    [{ action: "set_saved", itemId: null }, "missing_item"],
    [{ action: "set_read", itemId: 42 }, "invalid_item"],
    [{ action: "add_todo", text: "t", itemId: 42 }, "invalid_item"],
    [{ action: "add_todo", text: "   " }, "missing_text"],
    [{ action: "add_todo" }, "missing_text"],
    [{ action: "set_todo", id: 1.5, value: true }, "invalid_id"],
    [{ action: "delete_todo", id: "7" }, "invalid_id"],
    [{ action: "drop_table" }, "unknown_action"],
    [{}, "unknown_action"],
    [null, "unknown_action"],
    [["set_read"], "unknown_action"],
  ];
  for (const [body, error] of cases) assert.deepEqual(parseStateAction(body), { error }, JSON.stringify(body));
});
