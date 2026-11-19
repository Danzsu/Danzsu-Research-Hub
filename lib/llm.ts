import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { errorMessage } from "./pipeline/util.ts";

// Two providers over plain fetch, no SDKs. Which model runs which task is data,
// not code: the `model_settings` table (edit a row, the next run uses it).
// Only the API keys live in env.

export type Task =
  | "daily_shortlist" | "daily_curate" | "ingest_article" | "ingest_video"
  | "ingest_pdf";
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

/** A provider's refusal, with what the retry rule reads: the status and the body. */
class ProviderError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, host: string) {
    super(`${host} ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

/** The waits between attempts on one route while its provider is busy (503) or rate-limits (429). Tests zero them. */
export const retryDelaysMs = [10_000, 30_000];
/** An attempt slower than this was not a quick refusal: a retry would not fit the run's 300 s. */
const QUICK_FAILURE_MS = 30_000;
/** A spent balance or a daily quota does not come back within a run. */
const NOT_TRANSIENT = /credit|billing|prepay|per day/i;

function transient(error: unknown): error is ProviderError {
  return error instanceof ProviderError && (error.status === 503 || error.status === 429) && !NOT_TRANSIENT.test(error.body);
}

/** The wait before the next attempt: the provider's own "retry in Ns" when it gives one (at most a minute), else `fallback`. */
export function retryWaitMs(body: string, fallback: number): number {
  const asked = /retry in (\d+(?:\.\d+)?)s/i.exec(body);
  return asked ? Math.min(Number(asked[1]) * 1000 + 500, 60_000) : fallback;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new ProviderError(response.status, await response.text(), new URL(url).hostname);
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
 * key is missing is skipped, so a Groq-less setup simply uses the fallback. A quick 503 or 429
 * (a busy or rate-limiting provider) is retried on the same route after `retryDelaysMs`.
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
    if ((options.youtubeUrl || options.pdfBase64) && route.provider !== "gemini") {
      errors.push(`${route.provider}/${route.model}: skipped, only Gemini reads video and PDF input`);
      continue;
    }
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        return route.provider === "gemini"
          ? await gemini(route.model, schema, prompt, options)
          : await groq(route.model, schema, prompt);
      } catch (error) {
        if (attempt < retryDelaysMs.length && transient(error) && Date.now() - started < QUICK_FAILURE_MS) {
          const wait = retryWaitMs(error.body, retryDelaysMs[attempt]);
          console.warn(`${task}: ${route.provider}/${route.model} answered ${error.status}, retrying in ${Math.round(wait / 1000)} s`);
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }
        errors.push(`${route.provider}/${route.model}: ${errorMessage(error)}`);
        console.warn(`${task}: ${errors.at(-1)}`);
        break;
      }
    }
  }
  throw new Error(`${task} failed — ${errors.join("; ")}`);
}
