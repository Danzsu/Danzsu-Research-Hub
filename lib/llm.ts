import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { errorMessage } from "./pipeline/util.ts";

// Two providers over plain fetch, no SDKs. Which model runs which task is data,
// not code: the `model_settings` table (edit a row, the next run uses it).
// Only the API keys live in env.

export type Task =
  | "daily_shortlist" | "daily_curate" | "ingest_article" | "ingest_video"
  | "ingest_pdf" | "ingest_cleanup" | "translate_post";
type Provider = "gemini" | "groq";
type Route = { provider: Provider; model: string };

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const KEYS: Record<Provider, string> = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY" };

function jsonSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema; // meta-schema key; neither provider needs it
  return json;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

async function gemini<T extends z.ZodType>(
  model: string,
  schema: T,
  prompt: string,
  media: { youtubeUrl?: string; pdfBase64?: string } = {},
): Promise<z.infer<T>> {
  const parts: unknown[] = [{ text: prompt }];
  if (media.youtubeUrl) parts.unshift({ file_data: { file_uri: media.youtubeUrl } });
  if (media.pdfBase64) parts.unshift({ inline_data: { mime_type: "application/pdf", data: media.pdfBase64 } });

  const data = (await post(
    `${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema(schema),
        // Low resolution keeps a long video around ~100 tokens/second instead of ~300.
        ...(media.youtubeUrl ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
      },
    },
  )) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return schema.parse(JSON.parse(text));
}

async function groq<T extends z.ZodType>(model: string, schema: T, prompt: string): Promise<z.infer<T>> {
  const data = (await post(
    GROQ_URL,
    { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    {
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nRespond with a single JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema(schema))}`,
        },
      ],
    },
  )) as { choices?: Array<{ message?: { content?: string } }> };

  return schema.parse(JSON.parse(data.choices?.[0]?.message?.content ?? ""));
}

async function routesFor(db: SupabaseClient, task: Task): Promise<Route[]> {
  const { data, error } = await db
    .from("model_settings")
    .select("provider, model, fallback_provider, fallback_model")
    .eq("task", task)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`model_settings has no row for "${task}" — apply supabase/migrations`);
  const routes: Route[] = [{ provider: data.provider, model: data.model }];
  if (data.fallback_provider && data.fallback_model) routes.push({ provider: data.fallback_provider, model: data.fallback_model });
  return routes;
}

/**
 * Runs `task` on its configured model, then on its fallback. A route whose API
 * key is missing is skipped, so a Groq-less setup simply uses the fallback.
 */
export async function generate<T extends z.ZodType>(
  db: SupabaseClient,
  task: Task,
  schema: T,
  prompt: string,
  options: { youtubeUrl?: string; pdfBase64?: string } = {},
): Promise<z.infer<T>> {
  const errors: string[] = [];
  for (const route of await routesFor(db, task)) {
    if (!process.env[KEYS[route.provider]]) {
      errors.push(`${route.provider}: ${KEYS[route.provider]} not set`);
      continue;
    }
    // Only Gemini reads video and PDF input.
    if ((options.youtubeUrl || options.pdfBase64) && route.provider !== "gemini") continue;
    try {
      return route.provider === "gemini"
        ? await gemini(route.model, schema, prompt, options)
        : await groq(route.model, schema, prompt);
    } catch (error) {
      errors.push(`${route.provider}/${route.model}: ${errorMessage(error)}`);
      console.warn(`${task}: ${errors.at(-1)}`);
    }
  }
  throw new Error(`${task} failed — ${errors.join("; ")}`);
}
