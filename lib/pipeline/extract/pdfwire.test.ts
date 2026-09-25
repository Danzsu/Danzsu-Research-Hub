import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../fake-db.ts";
import { geminiResponse, mockFetch, TEST_IP, withGeminiKey } from "../mock-fetch.ts";
import { extractArticle } from "./article.ts";
import { extractPdf } from "./pdf.ts";

const db = fakeDb();
const handler = (robots: string | null) => async (url: string) =>
  url.includes("googleapis.com")
    ? geminiResponse({ title: "T", author: "  ", blocks: [{ type: "paragraph", text: "Body" }] })
    : new Response("%PDF-1.4", { headers: { "content-type": "application/pdf", ...(robots ? { "x-robots-tag": robots } : {}) } });

for (const [name, run] of [["extractPdf", extractPdf], ["extractArticle pdf branch", extractArticle]] as const) {
  test(`${name} honours X-Robots-Tag and nulls an empty author`, async (t) => {
    withGeminiKey(t);
    mockFetch(t, handler("googlebot: noarchive"));
    const result = await run(db, `http://${TEST_IP}/paper.pdf`, "");
    assert.equal(result.meta.noarchive, true);
    assert.equal(result.author, null); // the model's "  " (whitespace-only) author must become null, not ""
  });

  test(`${name} leaves meta.noarchive unset without an X-Robots-Tag`, async (t) => {
    withGeminiKey(t);
    mockFetch(t, handler(null));
    assert.equal((await run(db, `http://${TEST_IP}/paper.pdf`, "")).meta.noarchive, undefined);
  });
}

test("extractPdf sends Gemini a blocks array without maxItems and accepts a long answer", async (t) => {
  withGeminiKey(t);
  let schema: { properties: { blocks: Record<string, unknown> } } | undefined;
  const blocks = Array.from({ length: 450 }, (_, i) => ({ type: "paragraph", text: `Paragraph ${i}` }));
  mockFetch(t, async (url, init) => {
    if (!url.includes("googleapis.com")) return new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } });
    schema = JSON.parse(String(init?.body)).generationConfig.responseJsonSchema;
    return geminiResponse({ title: "Long", blocks });
  });
  const result = await extractPdf(db, `http://${TEST_IP}/long.pdf`, "");
  // Gemini answers INVALID_ARGUMENT for a maxItems on this array; ingest's limitBlocks clips instead.
  assert.equal(schema?.properties.blocks.maxItems, undefined);
  assert.equal(result.blocks.length, 450);
});

test("extractPdf falls back to the URL's decoded filename when the model gives no title", async (t) => {
  withGeminiKey(t);
  mockFetch(t, async (url) =>
    url.includes("googleapis.com")
      ? geminiResponse({ title: "", blocks: [{ type: "paragraph", text: "Body" }] })
      : new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }),
  );
  const result = await extractPdf(db, "https://1.2.3.4/docs/annual%20report.pdf", "");
  assert.equal(result.title, "annual report.pdf");
});
