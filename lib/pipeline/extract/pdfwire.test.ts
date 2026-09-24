import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeModelDb, geminiResponse, mockFetch, withGeminiKey } from "../mock-fetch.ts";
import { extractArticle } from "./article.ts";
import { extractPdf } from "./pdf.ts";

const db = fakeModelDb();
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
