import dns from "node:dns/promises";
import { errorMessage, isPrivateAddress, parseSubmittedUrl } from "./util.ts";

export const USER_AGENT = "Mozilla/5.0 (compatible; NeonRadar/1.0; private research digest)";

/** Fetching the source itself failed. `extract()` decides per kind whether a fallback can still help. */
export class FetchError extends Error {}

/** Standard GitHub REST headers: accept, this app's user agent, and an optional token. */
export function githubHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = { accept, "user-agent": USER_AGENT };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

/** Drops a response body we're not going to read, ignoring cancellation errors. */
export async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // best effort — the connection is being torn down either way
  }
}

/** Passes an ok response through; otherwise drops its body and throws `FetchError("<label> <status>")`. */
export async function ensureOk(response: Response, label: string): Promise<Response> {
  if (response.ok) return response;
  await cancelBody(response);
  throw new FetchError(`${label} ${response.status}`);
}

/**
 * Plain `fetch` for fixed API hosts (GitHub, arXiv, oEmbed, feeds) with this app's user agent and a
 * timeout. User-submitted URLs go through `safeFetch` instead.
 */
export function apiFetch(url: string, init: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Response> {
  return fetch(url, {
    headers: { "user-agent": USER_AGENT, ...init.headers },
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  });
}

/** Parses and DNS-checks one hop's URL; throws FetchError for anything internal or unresolvable. */
async function checkedHop(raw: string): Promise<URL> {
  const url = parseSubmittedUrl(raw);
  if (!url) throw new FetchError("blocked url");
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new FetchError(`cannot resolve ${url.hostname}`);
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new FetchError("blocked address");
  return url;
}

/**
 * Fetches a URL without reaching internal hosts: every hop is re-parsed,
 * DNS-resolved and checked, and redirects are followed by hand.
 * ponytail: a DNS answer can still change between lookup and connect
 * (rebinding); pin the resolved IP with an undici Agent if submitters stop being invited.
 */
export async function safeFetch(raw: string, init: { accept?: string; timeoutMs?: number } = {}): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = await checkedHop(current);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: init.accept ?? "*/*" },
        signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
        redirect: "manual",
      });
    } catch (error) {
      throw new FetchError(`fetch failed: ${errorMessage(error)}`);
    }
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await cancelBody(response); // hop unread: we're following the redirect, not reading this body
    try {
      current = new URL(location, url).toString();
    } catch {
      throw new FetchError(`invalid redirect location: ${location}`);
    }
  }
  throw new FetchError("too many redirects");
}

/**
 * Reads the body, refusing anything over `limit` bytes — unless `truncate` is set, in which case it
 * silently stops at `limit` and returns the prefix read so far instead of throwing. For a page whose
 * useful content (e.g. `<head>`) is always near the start, a bounded prefix is as good as the whole
 * thing; the caller just shouldn't have to write its own second stream loop to get one.
 */
export async function readLimited(response: Response, limit: number, options: { truncate?: boolean } = {}): Promise<Buffer> {
  if (!options.truncate && Number(response.headers.get("content-length") ?? 0) > limit) {
    await cancelBody(response);
    throw new Error(`larger than ${limit} bytes`);
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let step: { done: boolean; value?: Uint8Array };
    try {
      step = await reader.read();
    } catch (error) {
      throw new FetchError(`stream error: ${errorMessage(error)}`);
    }
    if (step.done) break;
    size += step.value!.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      if (!options.truncate) throw new Error(`larger than ${limit} bytes`);
      // Keep a partial slice of this chunk up to the limit — a small in-memory body can arrive as
      // one single oversized chunk, and dropping it whole would truncate to nothing instead of a prefix.
      const keep = step.value!.byteLength - (size - limit);
      if (keep > 0) chunks.push(step.value!.subarray(0, keep));
      break;
    }
    chunks.push(step.value!);
  }
  return Buffer.concat(chunks);
}

export const readText = async (response: Response, limit: number, options?: { truncate?: boolean }) =>
  new TextDecoder().decode(await readLimited(response, limit, options));

/**
 * Parses a response body as JSON, returning it only if it's a plain object — never `null`, an array,
 * or a primitive, and never throws: a non-JSON body (or any other read failure) also becomes `null`.
 * An oEmbed 200 can legitimately answer with any of those instead of the expected `{ ... }`; a caller
 * that blindly reads a field off the raw parse result turns that into a TypeError or silent `undefined`.
 */
export async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}
