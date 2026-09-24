import { Readability } from "@mozilla/readability";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHTML } from "linkedom";
import type { z } from "zod/v4";
import { generate } from "../llm.ts";
import { safeFetch } from "./fetch.ts";
import { SUMMARY_INSTRUCTIONS as INSTRUCTIONS, summarySchema as postSchema } from "./summary.ts";

const MAX_ATTEMPTS = 3;
const MAX_BODY = 200_000;
const MAX_PROMPT_TEXT = 60_000;

type Article = { title: string; author: string | null; body: string | null; text: string };

async function readArticle(url: string): Promise<Article> {
  const response = await safeFetch(url);
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  const html = await response.text();
  const { document } = parseHTML(html);

  // noarchive = the publisher asked not to be copied: keep metadata, drop the body.
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
  const mayMirror = !/noarchive/i.test(robots) && !/noarchive/i.test(response.headers.get("x-robots-tag") ?? "");

  const parsed = new Readability(document as unknown as Document).parse();
  // One block per paragraph-level element, so the mirror keeps its paragraphs.
  const BLOCKS = "p, h1, h2, h3, h4, li, pre, blockquote";
  const blocks = parseHTML(`<main>${parsed?.content ?? ""}</main>`).document.querySelectorAll(BLOCKS);
  const text = [...blocks]
    .filter((block) => !block.querySelector(BLOCKS)) // innermost only: <li><p> would repeat
    .map((block) => (block.textContent ?? "").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  if (text.length < 200) throw new Error("no readable article text found");
  return {
    title: parsed?.title ?? url,
    author: (parsed?.byline ?? parsed?.siteName ?? null)?.slice(0, 120) ?? null,
    body: mayMirror ? text.slice(0, MAX_BODY) : null,
    text,
  };
}

async function readVideo(url: string) {
  const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const meta = oembed.ok ? ((await oembed.json()) as { title?: string; author_name?: string }) : {};
  return { title: meta.title ?? url, author: meta.author_name ?? null };
}

/** Turns one submitted source into a post. Safe to re-run; failures are recorded on the source. */
export async function processSource(db: SupabaseClient, id: number): Promise<void> {
  const { data: source, error } = await db
    .from("sources")
    .select("id, url, kind, note, attempts")
    .eq("id", id)
    .single();
  if (error || !source) throw error ?? new Error(`source ${id} not found`);
  await db.from("sources").update({ attempts: source.attempts + 1 }).eq("id", id);

  try {
    const note = source.note ? `\nThe submitter's note: ${source.note}` : "";
    let post: { author: string | null; body: string | null; generated: z.infer<typeof postSchema> };

    if (source.kind === "youtube") {
      const video = await readVideo(source.url);
      post = {
        author: video.author,
        body: null,
        generated: await generate(
          db,
          "ingest_video",
          postSchema,
          `${INSTRUCTIONS}\nThe source is the attached YouTube video "${video.title}".${note}`,
          { youtubeUrl: source.url },
        ),
      };
    } else {
      const article = await readArticle(source.url);
      post = {
        author: article.author,
        body: article.body,
        generated: await generate(
          db,
          "ingest_article",
          postSchema,
          `${INSTRUCTIONS}${note}\n\nARTICLE "${article.title}":\n${article.text.slice(0, MAX_PROMPT_TEXT)}`,
        ),
      };
    }

    const { error: insertError } = await db.from("posts").upsert(
      {
        source_id: source.id,
        kind: source.kind,
        url: source.url,
        author: post.author,
        body: post.body,
        title: post.generated.title,
        summary: post.generated.summary,
        key_points: post.generated.keyPoints,
        tags: post.generated.tags,
      },
      { onConflict: "source_id" },
    );
    if (insertError) throw insertError;
    await db.from("sources").update({ status: "done", error: null }).eq("id", id);
  } catch (failure) {
    await db
      .from("sources")
      .update({ status: "failed", error: String(failure instanceof Error ? failure.message : failure).slice(0, 500) })
      .eq("id", id);
  }
}

/** Sources that never finished (e.g. the function was killed) or failed fewer than MAX_ATTEMPTS times. */
export async function retryPendingSources(db: SupabaseClient): Promise<number> {
  const { data } = await db
    .from("sources")
    .select("id")
    .neq("status", "done")
    .lt("attempts", MAX_ATTEMPTS)
    .order("id")
    .limit(10);
  for (const row of data ?? []) await processSource(db, row.id as number);
  return data?.length ?? 0;
}
