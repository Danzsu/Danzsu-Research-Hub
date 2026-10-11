import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { render } from "../../lib/test/render.ts";

const { EmptyState } = await import("./empty-state.tsx");
const { StatTile } = await import("./stat-tile.tsx");
const { Kbd } = await import("./kbd.tsx");

// 2a spec D8. Kills an empty state that isn't one dashed box with its text, a stat tile without its label and
// value, and a key badge that isn't a <kbd>.
test("the three small kit pieces render their one job each", () => {
  const empty = render(createElement(EmptyState, { tone: "ink" }, "Nothing here"));
  assert.match(empty.body.firstElementChild?.className ?? "", /border-dashed/);
  assert.match(empty.body.textContent ?? "", /Nothing here/);
  const tile = render(createElement(StatTile, { label: "Weekly progress", value: "42%", detail: "5 / 12" }));
  assert.match(tile.body.textContent ?? "", /Weekly progress.*42%.*5 \/ 12/s);
  const kbd = render(createElement(Kbd, null, "⌘K"));
  assert.equal(kbd.body.firstElementChild?.tagName, "KBD");
});
