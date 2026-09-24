import { assignIds, plainText, type BlockDraft } from "../../blocks.ts";
import { cancelBody, FetchError } from "../fetch.ts";
import { htmlToDrafts } from "../html-to-blocks.ts";
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

function headers(accept: string): Record<string, string> {
  const result: Record<string, string> = { accept, "user-agent": "NeonRadar" };
  if (process.env.GITHUB_TOKEN) result.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return result;
}

/**
 * GitHub's HTML-rendered README (Accept: application/vnd.github.html+json) proxies every
 * *absolute* external image through camo (data-canonical-src carries the original), but leaves a
 * same-repo relative src exactly as written in the markdown. Two of that markdown's own shapes
 * are root-relative and resolve wrong against imageBaseUrl (raw.githubusercontent.com/<repo>/<branch>/)
 * with plain URL resolution, because a leading "/" resolves against the *domain* root, not the repo:
 * - a bare repo-root path ("/docs/banner.png") needs the repo+branch re-inserted; and
 * - a path that already names the repo ("/<owner>/<repo>/raw/<branch>/docs/x.png" — the shape GitHub
 *   itself writes when a README used a root-relative link that only makes sense on github.com) needs
 *   the github.com origin, not raw.githubusercontent.com, or it would double up the owner/repo/branch.
 * A plain relative src ("docs/x.png") and an absolute one (camo included) resolve correctly already,
 * so this returns undefined for those and lets the caller fall back to normal resolution.
 */
export function resolveGithubImage(fullName: string, branch: string): (raw: string) => string | undefined {
  const repoRawPrefix = `/${fullName}/raw/`;
  return (raw: string) => {
    if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
    if (raw.startsWith(repoRawPrefix)) return `https://github.com${raw}`;
    return `https://raw.githubusercontent.com/${fullName}/${branch}${raw}`;
  };
}

export const extractGithub: Extractor = async (_db, url) => {
  const repo = githubRepo(new URL(url));
  if (!repo) throw new Error("not a GitHub repository URL");
  const api = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;

  const infoResponse = await fetch(api, { headers: headers("application/vnd.github+json"), signal: AbortSignal.timeout(20_000) });
  if (!infoResponse.ok) {
    await cancelBody(infoResponse);
    throw new FetchError(`github ${infoResponse.status}`);
  }
  const info = (await infoResponse.json()) as RepoInfo;

  const readmeResponse = await fetch(`${api}/readme`, { headers: headers("application/vnd.github.html+json"), signal: AbortSignal.timeout(20_000) });
  let readme = "";
  if (readmeResponse.ok) readme = await readmeResponse.text();
  else await cancelBody(readmeResponse);
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
