import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mockFetch } from "../mock-fetch.ts";
import { extractArticle } from "./article.ts";
import { extractPdf } from "./pdf.ts";

// Offline: a fake model_settings row + a mocked Gemini response. No Supabase, no Gemini network call.
const db = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { provider: "gemini", model: "m" }, error: null }) }) }) }),
} as unknown as SupabaseClient;
const gemini = (out: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
const handler = (robots: string | null) => async (url: string) =>
  url.includes("googleapis.com")
    ? gemini({ title: "T", author: "  ", blocks: [{ type: "paragraph", text: "Body" }] })
    : new Response("%PDF-1.4", { headers: { "content-type": "application/pdf", ...(robots ? { "x-robots-tag": robots } : {}) } });

for (const [name, run] of [["extractPdf", extractPdf], ["extractArticle pdf branch", extractArticle]] as const) {
  test(`${name} honours X-Robots-Tag and nulls an empty author`, async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test";
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
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });
}
