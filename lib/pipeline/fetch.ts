import { lookup } from "node:dns/promises";
import { isPrivateAddress, parseSubmittedUrl } from "./util.ts";

export const USER_AGENT = "Mozilla/5.0 (compatible; NeonRadar/1.0; private research digest)";

/** The source itself is unreachable: the fallback chain cannot help, the submission fails. */
export class FetchError extends Error {}

type DnsLookup = (hostname: string, options: { all: true }) => Promise<{ address: string }[]>;
let resolveHost: DnsLookup = lookup;

/**
 * Test seam only: `safeFetch` always resolves through this. A few extractors hit a fixed real
 * hostname (arxiv.org) that a test can't parameterize away, so tests point this at a fake
 * resolver instead of requiring a live DNS query; production code never calls it.
 */
export function setDnsLookup(fn: DnsLookup): () => void {
  const previous = resolveHost;
  resolveHost = fn;
  return () => {
    resolveHost = previous;
  };
}

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

/** Parses and DNS-checks one hop's URL; throws FetchError for anything internal or unresolvable. */
async function checkedHop(raw: string): Promise<URL> {
  const url = parseSubmittedUrl(raw);
  if (!url) throw new FetchError("blocked url");
  let addresses: { address: string }[];
  try {
    addresses = await resolveHost(url.hostname, { all: true });
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
      throw new FetchError(`fetch failed: ${error instanceof Error ? error.message : error}`);
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

/** Reads the body, refusing anything over `limit` bytes. */
export async function readLimited(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get("content-length") ?? 0) > limit) {
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
      throw new FetchError(`stream error: ${error instanceof Error ? error.message : error}`);
    }
    if (step.done) break;
    size += step.value!.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new Error(`larger than ${limit} bytes`);
    }
    chunks.push(step.value!);
  }
  return Buffer.concat(chunks);
}

export const readText = async (response: Response, limit: number) => new TextDecoder().decode(await readLimited(response, limit));
