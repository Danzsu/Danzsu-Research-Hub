import assert from "node:assert/strict";
import { test } from "node:test";
import "../../lib/test/render.ts";

const { claimAutoOpen } = await import("./sign-in-sheet.tsx");

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};

// Kills the sheet popping up again after it was shown or dismissed in this visit, and a blocked storage
// (a private window) turning into a pop-up on every page: without storage it never opens by itself.
test("the sign-in sheet opens by itself once per visit, and never without storage", () => {
  const storage = memory();
  assert.equal(claimAutoOpen(() => storage), true);
  assert.equal(claimAutoOpen(() => storage), false);
  assert.equal(
    claimAutoOpen(() => {
      throw new Error("SecurityError");
    }),
    false,
  );
});
