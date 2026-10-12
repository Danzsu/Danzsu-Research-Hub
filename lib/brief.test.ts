import assert from "node:assert/strict";
import { test } from "node:test";
import { readBrief } from "./brief.ts";

// Spec N5, N8. Kills a post made before briefs (null), an empty brief (only the description was available) or
// a malformed one reaching the card as if it were a brief: each falls back to the summary.
test("readBrief answers a brief only when both languages have paragraphs", () => {
  const brief = { hu: ["Első.", "Második."], en: ["First.", "Second."] };
  assert.deepEqual(readBrief(brief), brief);
  assert.equal(readBrief(null), null);
  assert.equal(readBrief({ hu: [], en: [] }), null);
  assert.equal(readBrief({ hu: ["Csak magyar."], en: [] }), null);
  assert.equal(readBrief({ hu: "nem lista", en: ["x"] }), null);
});
