import assert from "node:assert/strict";
import { test } from "node:test";
import { isEditableTarget, nextCardIndex, shortcutFor, type KeyPress, type KeyTarget } from "./keymap.ts";

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...modifiers });
const page: KeyTarget = { editable: false, inDialog: false };

test("each single key maps to its action", () => {
  assert.deepEqual(
    ["j", "k", "o", "r", "l", "/", "?", "["].map((key) => shortcutFor(press(key), page)),
    ["next", "previous", "open", "read", "later", "search", "help", "toggleNav"],
  );
});

test("nothing fires while typing, whatever the key", () => {
  const typing: KeyTarget = { editable: true, inDialog: false };
  for (const keyPress of [press("j"), press("r"), press("o"), press("?"), press("/"), press("["), press("k", { metaKey: true })]) {
    assert.equal(shortcutFor(keyPress, typing), null, keyPress.key);
  }
});

test("an open dialog or an IME composition swallows shortcuts", () => {
  assert.equal(shortcutFor(press("j"), { editable: false, inDialog: true }), null);
  assert.equal(shortcutFor(press("j", { isComposing: true }), page), null);
});

test("browser combos stay the browser's; Ctrl or ⌘ + K is search, AltGr + K is not", () => {
  assert.equal(shortcutFor(press("r", { ctrlKey: true }), page), null, "Ctrl+R still reloads");
  assert.equal(shortcutFor(press("r", { metaKey: true }), page), null);
  assert.equal(shortcutFor(press("j", { altKey: true }), page), null);
  assert.equal(shortcutFor(press("J"), page), null, "Shift+J is not j");
  assert.equal(shortcutFor(press("k", { ctrlKey: true }), page), "search");
  assert.equal(shortcutFor(press("K", { metaKey: true }), page), "search");
  assert.equal(shortcutFor(press("k", { ctrlKey: true, altKey: true }), page), null, "AltGr is Ctrl+Alt on Windows");
});

test("a symbol typed with AltGr or Alt still counts: [ is AltGr+F on the Hungarian layout", () => {
  assert.equal(shortcutFor(press("[", { ctrlKey: true, altKey: true }), page), "toggleNav", "Windows AltGr");
  assert.equal(shortcutFor(press("[", { altKey: true }), page), "toggleNav", "macOS Option");
  assert.equal(shortcutFor(press("[", { metaKey: true }), page), null, "⌘[ stays the browser's Back");
  assert.equal(shortcutFor(press("/", { ctrlKey: true }), page), null, "Ctrl without Alt is not AltGr");
});

test("z undoes the visible toast, and is blocked while typing like every other shortcut", () => {
  assert.equal(shortcutFor(press("z"), page), "undo");
  assert.equal(shortcutFor(press("z"), { editable: true, inDialog: false }), null);
});

test("isEditableTarget: form fields and contenteditable, not buttons or cards", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(isEditableTarget({ tagName }), true, tagName);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  for (const tagName of ["BUTTON", "A", "ARTICLE", "BODY"]) assert.equal(isEditableTarget({ tagName, isContentEditable: false }), false, tagName);
  assert.equal(isEditableTarget(null), false);
});

test("nextCardIndex starts at the first card and stops at both ends", () => {
  assert.equal(nextCardIndex(-1, 5, 1), 0);
  assert.equal(nextCardIndex(-1, 5, -1), 0);
  assert.equal(nextCardIndex(2, 5, 1), 3);
  assert.equal(nextCardIndex(4, 5, 1), 4);
  assert.equal(nextCardIndex(0, 5, -1), 0);
  assert.equal(nextCardIndex(-1, 0, 1), null);
});
