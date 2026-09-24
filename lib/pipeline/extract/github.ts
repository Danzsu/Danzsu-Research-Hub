import { assignIds, plainText, type BlockDraft } from "../../blocks.ts";
import { cancelBody, FetchError, githubHeaders } from "../fetch.ts";
import { htmlToDrafts } from "../html-to-blocks.ts";
import type { ImageResolver } from "../html-images.ts";
import { githubRepo } from "../util.ts";
import type { Extractor } from "./types.ts";

type RepoInfo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  license: { spdx_id: string | null } | null;
  default_branch: string;
  pushed_at: string | null;
  owner: { login: string };
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A root-relative README image src ("/docs/banner.png") isn't relative to the domain — it's
 * relative to the repo, so it needs the repo+branch re-inserted before raw.githubusercontent.com
 * will serve it. One that already names the repo ("/<owner>/<repo>/(blob|raw)/<branch>/docs/x.png",
 * matched case-insensitively since repo names and README links aren't always the same case) also
 * needs rebuilding, not just an origin swap to github.com: a "/blob/" link is the HTML file-viewer
 * page, not image bytes, so `mirrorImages` would drop it. Both shapes are rebuilt directly as a
 * raw.githubusercontent.com URL, keeping the branch the link itself named (a README can point at a
 * pinned tag or an old snapshot, not always the repo's current default branch). A plain relative src
 * ("docs/x.png") and an absolute one resolve correctly already, so this returns undefined for those
 * and lets the caller fall back to normal resolution.
 */
export function resolveGithubImage(fullName: string, branch: string): ImageResolver {
  const repoLink = new RegExp(`^/${escapeRegExp(fullName)}/(?:blob|raw)/([^/]+)/(.*)$`, "i");
  return (raw: string) => {
    if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
    const match = repoLink.exec(raw);
    if (match) return `https://raw.githubusercontent.com/${fullName}/${match[1]}/${match[2]}`;
    return `https://raw.githubusercontent.com/${fullName}/${branch}${raw}`;
  };
}

export const extractGithub: Extractor = async (_db, url) => {
  const repo = githubRepo(new URL(url));
  if (!repo) throw new Error("not a GitHub repository URL");
  const api = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;

  const infoResponse = await fetch(api, { headers: githubHeaders("application/vnd.github+json"), signal: AbortSignal.timeout(20_000) });
  if (!infoResponse.ok) {
    await cancelBody(infoResponse);
    throw new FetchError(`github ${infoResponse.status}`);
  }
  const info = (await infoResponse.json()) as RepoInfo;

  // Only a 404 means "this repo has no README" — any other failure (403 rate limit, 502, …) must
  // fail the whole extraction so the article fallback runs, not silently produce a README-less post.
  const readmeResponse = await fetch(`${api}/readme`, { headers: githubHeaders("application/vnd.github.html+json"), signal: AbortSignal.timeout(20_000) });
  let readme = "";
  if (readmeResponse.ok) {
    readme = await readmeResponse.text();
  } else {
    await cancelBody(readmeResponse);
    if (readmeResponse.status !== 404) throw new FetchError(`github readme ${readmeResponse.status}`);
  }
  const branch = encodeURIComponent(info.default_branch);

  const drafts: BlockDraft[] = [
    {
      type: "repo",
      fullName: info.full_name,
      url: info.html_url,
      stars: info.stargazers_count,
      language: info.language ?? undefined,
      topics: info.topics ?? [],
      license: info.license?.spdx_id && info.license.spdx_id !== "NOASSERTION" ? info.license.spdx_id : undefined,
    },
    ...htmlToDrafts(readme, {
      baseUrl: `https://github.com/${info.full_name}/blob/${branch}/`,
      imageBaseUrl: `https://raw.githubusercontent.com/${info.full_name}/${branch}/`,
      resolveImage: resolveGithubImage(info.full_name, branch),
    }),
  ];
  const blocks = assignIds(drafts);
  return {
    blocks,
    title: info.full_name,
    author: info.owner.login,
    siteName: "GitHub",
    publishedAt: info.pushed_at?.slice(0, 10) ?? null,
    meta: { stars: info.stargazers_count, language: info.language, topics: info.topics ?? [] },
    text: [info.description ?? "", plainText(blocks)].join("\n\n"),
  };
};
