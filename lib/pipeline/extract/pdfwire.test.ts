import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, geminiResponse, mockFetch, withGeminiKey } from "../mock-fetch.ts";
import { extractArticle } from "./article.ts";
import { extractPdf } from "./pdf.ts";

const db = fakeDb();
const handler = (robots: string | null) => async (url: string) =>
  url.includes("googleapis.com")
    ? geminiResponse({ title: "T", author: "  ", blocks: [{ type: "paragraph", text: "Body" }] })
    : new Response("%PDF-1.4", { headers: { "content-type": "application/pdf", ...(robots ? { "x-robots-tag": robots } : {}) } });

for (const [name, run] of [["extractPdf", extractPdf], ["extractArticle pdf branch", extractArticle]] as const) {
  test(`${name} honours X-Robots-Tag and nulls an empty author`, async () => {
    const restoreKey = withGeminiKey();
    try {
      let restore = mockFetch(handler("googlebot: noarchive"));
      try {
        const result = await run(db, "http://93.184.216.34/paper.pdf", "");
        assert.equal(result.meta.noarchive, true);
        assert.equal(result.author, null); // the model's "  " (whitespace-only) author must become null, not ""
      } finally {
        restore();
      }
      restore = mockFetch(handler(null));
      try {
        assert.equal((await run(db, "http://93.184.216.34/paper.pdf", "")).meta.noarchive, undefined);
      } finally {
        restore();
      }
    } finally {
      restoreKey();
    }
  });
}

// fix round 3, item 2 (5a): the model's title is empty, so extractPdfResponse falls back to the
// URL's own decoded filename via the shared filenameOf helper.
test("extractPdf falls back to the URL's decoded filename when the model gives no title", async () => {
  const restoreKey = withGeminiKey();
  const restore = mockFetch(async (url) =>
    url.includes("googleapis.com")
      ? geminiResponse({ title: "", blocks: [{ type: "paragraph", text: "Body" }] })
      : new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }),
  );
  try {
    const result = await extractPdf(db, "https://1.2.3.4/docs/annual%20report.pdf", "");
    assert.equal(result.title, "annual report.pdf");
  } finally {
    restore();
    restoreKey();
  }
});
