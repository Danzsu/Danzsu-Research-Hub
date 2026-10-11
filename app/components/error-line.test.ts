import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { render } from "../../lib/test/render.ts";

const { ErrorLine } = await import("./error-line.tsx");

// R2 spec 2. Kills the role dropped (a screen reader would stay silent on a failed write), the text lost,
// the region mounted only with an error (it must be in the tree before its text changes, or the change may
// go unannounced), and the strip shown with no error.
test("ErrorLine is an always-mounted alert region that shows its strip only with an error", () => {
  const failed = render(createElement(ErrorLine, null, "Nem sikerült, próbáld újra."));
  assert.equal(failed.querySelector('[role="alert"] > p')?.textContent, "Nem sikerült, próbáld újra.");
  const quiet = render(createElement(ErrorLine, null, null));
  assert.equal(quiet.querySelectorAll('[role="alert"]').length, 1);
  assert.equal(quiet.querySelector('[role="alert"] > p'), null, "no strip without an error");
});
