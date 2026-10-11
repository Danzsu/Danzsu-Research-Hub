# Kódbázis-rend, config és a GitHub-rész javításai — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dokumentáció a `.claude/`, a források és az env-leírás a `config/` alá kerül; belépés nélkül a `/` a landingre visz; a repó-kártya a saját értékelő-csoportját hordozza; a GitHub repók önálló `/github` menüpont; a napi futás törli a régi rangokat.

**Architecture:** Hét feladat, mindegyik egy commit. Az első négy a kód (tiszta függvény + proxy, a napi futás, a `RepoCard`, a `/github` útvonal), az utolsó három a költöztetés (`config/`, `.claude/`) és a dokumentáció. A költöztetés `git mv`, a doksit olvasó tesztek egy közös `docFile` segéden át találják meg az új helyet.

**Tech Stack:** Next.js 16.3.4 (App Router), React 19.2, TypeScript, `node --test` + linkedom, Playwright MCP az előnézeten.

**Spec:** `docs/superpowers/specs/2026-10-11-codebase-order-and-config-design.md` (a 6. feladat után: `.claude/docs/specs/2026-10-11-codebase-order-and-config-design.md`).

## Global Constraints

- Az öt ellenőrzés minden commit előtt: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`.
- `lib/`-ben az importok relatív `.ts` utak, soha `@/` (CODE_STYLE.md → Imports).
- UI-szöveg egy `{ hu, en }` copy-objektumban komponensenként.
- Nincs új függőség. Nincs `NEXT_PUBLIC_`, nincs `dangerouslySetInnerHTML`.
- Az előnézet nem nyúl valódi adathoz.
- Commit: Conventional Commits, kisbetűs felszólító tárgy, explicit pathspec, attribution-sor nélkül. Push nincs.
- `node --test` útvonalban minden `[` → `[[]`.
- Minden teszt egy mutációs próbával bizonyítva (`scratchpad/probe.py`).

## Review Focus

1. **Belépés nélkül `/?valami=1`:** a landingre megy, nem a `/login?next=/?valami=1`-re, és nem jön hurok. → 1. feladat tesztje.
2. **Régi `/archive/github?rating=heart&lang=C%2B%2B` link:** a `/github`-ra irányít a query-vel együtt. → 4. feladat, a `next.config.ts` redirect-tesztje.
3. **Üres repó-lista a napi futásban** (a modell 0 repót adott): a hét meglévő rangjai megmaradnak, nem törlődnek. → 2. feladat tesztje.
4. **Egy 80 karakteres repónév 360 px-en:** a kártya tördel, nincs vízszintes görgetés, a csoport a sor alá kerül. → 3. feladat Playwright-próbája (7. feladat).
5. **Egy doksi-teszt a költöztetés után hiányzó fájlt olvas:** nem csendes zöld, hanem hiba. → 6. feladat: a `docFile` ENOENT-et dob, és a három teszt tartalmi állítása (≥20 kivonat, a `### Hírcsatornák` szakasz, a `colors:` blokk) önmagában bukik egy üres fájlon.

---

### Task 1: Belépés nélkül a főoldal a landingre

**Files:**
- Modify: `lib/public-paths.ts`, `proxy.ts`
- Test: `lib/public-paths.test.ts`

**Interfaces:**
- Produces: `signedOutTarget(pathname: string, search: string): string`.

- [ ] **Step 1: A teszt (RED).** A `lib/public-paths.test.ts` végére:

```ts
// Kills the home sent to sign-in (a visitor would never see the landing page), a query carried to /about,
// and any other page losing its way back.
test("signedOutTarget sends the home to the landing page and every other page to sign-in with its way back", () => {
  assert.equal(signedOutTarget("/", ""), "/about");
  assert.equal(signedOutTarget("/", "?a=1"), "/about");
  assert.equal(signedOutTarget("/library", "?x=1"), "/login?next=%2Flibrary%3Fx%3D1");
  assert.equal(signedOutTarget("/archive/2026-W38", ""), "/login?next=%2Farchive%2F2026-W38");
});
```

Az import sorába: `import { isDevPreviewPath, isPublicPath, signedOutTarget } from "./public-paths.ts";`

- [ ] **Step 2: Futtatás.** `node --experimental-strip-types --no-warnings --test lib/public-paths.test.ts` → Expected: FAIL, `signedOutTarget` nem export.

- [ ] **Step 3: A függvény.** A `lib/public-paths.ts` végére:

```ts
/** Where a signed-out request goes: the landing page for the home, otherwise sign-in with the way back. */
export const signedOutTarget = (pathname: string, search: string): string =>
  pathname === "/" ? "/about" : `/login?next=${encodeURIComponent(pathname + search)}`;
```

- [ ] **Step 4: A proxy.** A `proxy.ts`-ben az import `{ isDevPreviewPath, isPublicPath, signedOutTarget }`, és a blokk:

```ts
  if (!data?.claims && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL(signedOutTarget(pathname, search), request.nextUrl));
  }
```

- [ ] **Step 5: Futtatás.** Ugyanaz a parancs → Expected: PASS. Próba: a `pathname === "/"` ág `false`-ra → a teszt bukik.

- [ ] **Step 6: Commit.**

```bash
git commit -m "fix: send a signed-out visitor from the home to the landing page" -- lib/public-paths.ts lib/public-paths.test.ts proxy.ts
```

---

### Task 2: A napi futás törli a régi rangokat

**Files:**
- Modify: `lib/pipeline/daily.ts:149-152`, `lib/pipeline/fake-db.ts:493-504` (a törlés-lánc)
- Test: `lib/pipeline/daily.test.ts`

**Interfaces:**
- Consumes: a `fakeDb` `deletes` naplója: `{ table, filters: [column, value][] }[]`.
- Produces: a `deletes` bejegyzés `filters` eleme `[column, value, op?]` lehet, ahol `op` `"gt"`; az `eq` szűrő kételeműn marad, hogy a meglévő `route.test.ts` állítás változatlan.

- [ ] **Step 1: A teszt (RED).** A `daily.test.ts` első `runDaily` tesztjébe, az `upserted.github_top.options` állítás után:

```ts
  // The week's Top 10 is rewritten by rank; a shorter day must not leave yesterday's ranks 9–10 behind.
  assert.deepEqual(db.deletes, [{ table: "github_top", filters: [["issue_id", "2026-W39"], ["rank", 1, "gt"]] }]);
```

És egy új teszt a fájl végére:

```ts
// Review Focus 3. Kills a run with no repos wiping the week's ranking (a model hiccup would empty the Top 10).
test("runDaily with no repos leaves the week's github_top rows alone", async (t) => {
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {});
  mockFetch(t, async (url) => {
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: hnHits(1) });
    if (url.startsWith("https://generativelanguage.googleapis.com/")) return geminiResponse({ items: [], github: [] });
    return new Response("", { status: 404 });
  });
  const db = fakeDb();
  await runDaily(db, new Date("2026-09-23T05:00:00Z"));
  assert.deepEqual(db.deletes, []);
  assert.equal(db.upserts.some((u) => u.table === "github_top"), false);
});
```

- [ ] **Step 2: Futtatás.** `node --experimental-strip-types --no-warnings --test lib/pipeline/daily.test.ts` → Expected: az első teszt FAIL (`deletes` üres), a második PASS.

- [ ] **Step 3: A fake.** A `fake-db.ts` törlés-láncában a `filters` típusa `[string, unknown, "gt"?][]`, és a lánc kap egy `gt`-t:

```ts
      delete: () => {
        const filters: [string, unknown, "gt"?][] = [];
        deletes.push({ table, filters });
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          gt: (column: string, value: unknown) => {
            filters.push([column, value, "gt"]);
            return chain;
          },
          then: ...
```

A `FakeIngestDb["deletes"]` típusa (87. sor): `{ table: string; filters: [column: string, value: unknown, op?: "gt"][] }[]`.

- [ ] **Step 4: A futás.** A `daily.ts`-ben a `github_top` upsert blokkja:

```ts
  if (top.length) {
    const { error } = await db.from("github_top").upsert(top, { onConflict: "issue_id,rank" });
    if (error) throw error;
    // Yesterday's ranks past today's list would stay as stale rows: the upsert only touches ranks 1..N.
    const { error: trimError } = await db.from("github_top").delete().eq("issue_id", week.id).gt("rank", top.length);
    if (trimError) throw trimError;
  }
```

- [ ] **Step 5: Futtatás.** → Expected: PASS. Próbák: a `.gt("rank", top.length)` → `.gt("rank", 10)` → az első teszt bukik; a törlés az `if` elé húzva → a második bukik.

- [ ] **Step 6: Commit.**

```bash
git commit -m "fix: drop the week's stale github ranks after a shorter daily run" -- lib/pipeline/daily.ts lib/pipeline/daily.test.ts lib/pipeline/fake-db.ts
```

---

### Task 3: A `RepoCard` és az értékelés a kártyán belül

**Files:**
- Create: `app/components/repo-card.tsx`, `lib/repo-format.ts`, `lib/repo-format.test.ts`, `app/components/repo-card.test.ts`
- Modify: `app/components/digest-dashboard.tsx` (`GithubTopList`), `app/(app)/archive/github-view.tsx` (a sor), `app/components/shell.test.ts` (a Top 10 teszt), `DESIGN.md` (a kivonat)

**Interfaces:**
- Produces: `RepoCard({ rank?, repo, url, focus, meta, target, initial, className? })`; `formatStars(stars: number | null): string` („152K”, „—”); `weekSpan(first: string, last: string): string` („W36–W39”, „W38”).
- Consumes: `RatingControl`, `dislikedClass`, `RatingTarget`, `RatingValue`.

- [ ] **Step 1: A formázó tesztje (RED).** `lib/repo-format.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatStars, weekSpan } from "./repo-format.ts";

// Kills a star count shown raw (152000 doesn't fit a card), a null shown as "null", and a week span
// that repeats one week ("W38–W38").
test("formatStars is compact and weekSpan collapses a single week", () => {
  assert.deepEqual([formatStars(152000), formatStars(640), formatStars(null)], ["152K", "640", "—"]);
  assert.deepEqual([weekSpan("2026-W36", "2026-W39"), weekSpan("2026-W38", "2026-W38")], ["W36–W39", "W38"]);
});
```

- [ ] **Step 2: Futtatás.** `node --experimental-strip-types --no-warnings --test lib/repo-format.test.ts` → Expected: FAIL (nincs modul).

- [ ] **Step 3: A modul.** `lib/repo-format.ts`:

```ts
// "152K" reads the same in both languages, so a server view can render it without knowing the reader's.
const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** A repo's stars for a card: compact, or "—" before G1 (no count stored). */
export const formatStars = (stars: number | null): string => (stars === null ? "—" : compact.format(stars));

const weekLabel = (week: string) => week.slice(5);

/** "W36–W39", or "W38" for a repo that was up one week. */
export const weekSpan = (first: string, last: string): string => (first === last ? weekLabel(last) : `${weekLabel(first)}–${weekLabel(last)}`);
```

- [ ] **Step 4: Futtatás.** → PASS.

- [ ] **Step 5: A kártya tesztje (RED).** `app/components/repo-card.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../lib/test/render.ts";

const { RepoCard } = await import("./repo-card.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { RatingsProvider } = await import("./rating-control.tsx");

const card = (props: ComponentProps<typeof RepoCard>) =>
  render(createElement(LanguageProvider, { initial: "hu" } as ComponentProps<typeof LanguageProvider>, createElement(RatingsProvider, { send: async () => ({}) }, createElement(RepoCard, props))));

// Spec 2.2. Kills the rating group left outside the card, the card made a link (a button in a link), the
// name not linking to the repo in a new tab, and the rank shown when there is none.
test("a repo card holds its rating group inside, links only its name, and shows a rank only when given", () => {
  const doc = card({ rank: 3, repo: "Owner/Repo", url: "https://github.com/Owner/Repo", focus: "A tool", meta: "Rust · ★ 42 · 88/100", target: { kind: "repo", id: "owner/repo" }, initial: 2 });
  const article = doc.querySelector("article")!;
  assert.equal(article.querySelectorAll('[role="group"][data-rating="heart"]').length, 1);
  const links = [...article.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.getAttribute("target"), a.textContent?.trim()]);
  assert.deepEqual(links, [["https://github.com/Owner/Repo", "_blank", "Owner/Repo"]]);
  assert.equal(article.querySelectorAll('a [role="group"]').length, 0);
  assert.match(article.textContent ?? "", /03/);
  assert.match(article.textContent ?? "", /Rust · ★ 42 · 88\/100/);
  const plain = card({ repo: "a/b", url: "https://github.com/a/b", focus: "", meta: "—", target: { kind: "repo", id: "a/b" }, initial: null });
  assert.doesNotMatch(plain.querySelector("article")?.textContent ?? "", /0\d/);
});
```

- [ ] **Step 6: Futtatás.** `node --experimental-strip-types --no-warnings --test app/components/repo-card.test.ts` → FAIL (nincs modul).

- [ ] **Step 7: A komponens.** `app/components/repo-card.tsx`:

```tsx
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { RatingTarget, RatingValue } from "@/lib/ratings";
import { dislikedClass } from "./rating-classes";
import { RatingControl } from "./rating-control";

/** A repo on paper: the Radar's Top 10 row and the GitHub page's row. The name is the link (a button can't sit
 *  in a link, so the card itself isn't one); the rating group sits inside, at the foot (spec 2.2). */
export function RepoCard({ rank, repo, url, focus, meta, target, initial, className = "" }: {
  rank?: number;
  repo: string;
  url: string;
  focus: string;
  /** The mono line at the foot: language, stars, score, weeks. */
  meta: ReactNode;
  target: RatingTarget;
  initial: RatingValue | null;
  className?: string;
}) {
  return (
    <article className={`press min-w-0 border-2 border-ink bg-paper p-4 transition motion-safe:hover:-translate-y-0.5 ${dislikedClass} ${className}`}>
      <div className="flex items-start gap-4">
        {rank !== undefined && <span className="font-display text-3xl leading-none text-signal">{String(rank).padStart(2, "0")}</span>}
        <div className="min-w-0 flex-1">
          <a href={url} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-10 items-center gap-2 font-mono text-sm font-bold [overflow-wrap:anywhere] hover:text-signal">
            {repo}
            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          </a>
          {focus && <p className="text-sm text-ink/55">{focus}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="min-w-48 flex-1 font-mono text-[11px] text-ink/55">{meta}</p>
        <RatingControl target={target} initial={initial} />
      </div>
    </article>
  );
}
```

- [ ] **Step 8: Futtatás.** → PASS. Próbák: a `RatingControl` az `a` belsejébe → bukik; a `target="_blank"` törölve → bukik.

- [ ] **Step 9: A Top 10 a kártyán át.** A `digest-dashboard.tsx`-ben a `GithubTopList`:

```tsx
export function GithubTopList({ entries, ratings }: { entries: GithubTopEntry[]; ratings?: Ratings }) {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {entries.map(({ repo, focus, url, stars, language, score }, index) => (
        <RepoCard
          key={repo}
          rank={index + 1}
          repo={repo}
          url={url}
          focus={focus}
          meta={`${language ?? "—"} · ★ ${formatStars(stars)} · ${score === null ? "—" : `${score}/100`}`}
          target={{ kind: "repo", id: repo }}
          initial={ratings?.[ratingKey({ kind: "repo", id: repo })] ?? null}
        />
      ))}
    </div>
  );
}
```

Importok: `import { RepoCard } from "./repo-card";`, `import { formatStars } from "@/lib/repo-format";`; a `dislikedClass` és az `ExternalLink` importja innen kikerül, ha más nem használja (grep).

- [ ] **Step 10: A GitHub-oldal sorai.** A `github-view.tsx`-ben a `<li>` tartalma:

```tsx
            <li key={repo.key}>
              <RepoCard
                repo={repo.repo}
                url={repo.url}
                focus={repo.focus}
                meta={<>{repo.language ?? "—"} · ★ {formatStars(repo.stars)} · {repo.score === null ? "—" : `${repo.score}/100`} · {weekSpan(repo.firstWeek, repo.lastWeek)} · {repo.weekCount} <LocalizedText value={copy.weeks} /> · <LocalizedText value={copy.best} /> #{repo.bestRank}</>}
                target={{ kind: "repo", id: repo.key }}
                initial={repo.rating}
              />
            </li>
```

A helyi `orDash`, `compact`, `weekLabel` segédek és a `dislikedClass`, `ExternalLink`, `RatingControl` importok kikerülnek; jön a `RepoCard`, `formatStars`, `weekSpan`. A `github-view.test.ts` `li [role="group"]` állítása változatlanul igaz.

- [ ] **Step 11: A shell-teszt.** A `shell.test.ts` Top 10 tesztjében a sorokat az `article` adja:

```ts
  const rows = [...doc.querySelectorAll("article")];
  assert.equal(rows.length, previewGithub.length);
  assert.equal(doc.querySelectorAll('a [role="group"]').length, 0);
  assert.equal(rows[0].querySelector('[role="group"]')?.getAttribute("data-rating"), "down");
  assert.match(rows[0].textContent ?? "", /92\/100/);
  assert.match(rows[1].textContent ?? "", /— · ★ — · —/);
```

(a mai `group.parentElement` és a `querySelector("a")?.textContent` sorok helyett.)

- [ ] **Step 12: DESIGN.md.** A „Pressed state” szakasz „the GitHub rows” → „the repo cards (`repo-card.tsx`)”. Ha a `GithubTopList`-ből van kivonat a DESIGN.md-ben (grep `GithubTopList`), újramásolás; ha nincs, egy új kivonat a `RepoCard` `article` sorából a „must-card and story-card” szakasz után, `### Repo card` címmel: „A repo on paper: the name is the link, the rating group sits inside at the foot, so a 👎 card dashes its own frame.”

- [ ] **Step 13: Futtatás.** `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts app/components/repo-card.test.ts "app/(app)/archive/github-view.test.ts" lib/design-excerpts.test.ts lib/repo-format.test.ts` → PASS. `npx tsc --noEmit && npx eslint app lib` → tiszta.

- [ ] **Step 14: Commit.**

```bash
git add app/components/repo-card.tsx app/components/repo-card.test.ts lib/repo-format.ts lib/repo-format.test.ts
git commit -m "feat: put a repo's rating inside its card on the radar and the github list" -- app/components lib/repo-format.ts lib/repo-format.test.ts "app/(app)/archive/github-view.tsx" DESIGN.md
```

---

### Task 4: A `/github` menüpont

**Files:**
- Move: `app/(app)/archive/(list)/github/page.tsx` → `app/(app)/github/page.tsx`; `app/(app)/archive/github-view.tsx` → `app/(app)/github/github-view.tsx`; `app/(app)/archive/github-view.test.ts` → `app/(app)/github/github-view.test.ts`
- Create: `app/(app)/github/loading.tsx`, `next.config.test.ts`
- Delete: `app/(app)/archive/archive-tabs.tsx`
- Modify: `app/(app)/archive/archive-view.tsx`, `lib/nav.ts`, `lib/nav.test.ts`, `app/components/nav-parts.tsx` (ikon), `app/components/shell.test.ts`, `app/dev/preview/page.tsx`, `next.config.ts`, `CLAUDE.md` (Loading skeletons, GitHub tab sorai), `app/(app)/github/github-view.tsx` (hrefek, hero)

**Interfaces:**
- Produces: `NavId` bővül `"github"`-bal; `githubHref` `/github?…`-t ad; `next.config.ts` `redirects()` egy bejegyzéssel.

- [ ] **Step 1: A nav tesztje (RED).** `lib/nav.test.ts`: az `activeNavId` tesztjében `assert.equal(activeNavId("/archive/github"), "archive");` → `assert.equal(activeNavId("/github"), "github");` és `assert.equal(activeNavId("/github?rating=heart"), "github");` nem kell (a pathname query nélkül jön). A mobil tesztbe: `assert.equal(inMobileMore(activeNavId("/github")), true);`. A gyűjtemény-teszt mintájára:

```ts
// Spec 2.3. Kills the GitHub list left under the archive, or kept off the mobile Több.
test("the github repos are a live page in the mobile Több sheet, switching language in place", () => {
  const github = NAV_ITEMS.find((item) => item.id === "github");
  assert.deepEqual([github?.href, github?.soon, github?.mobileMore], ["/github", undefined, true]);
  assert.equal(switchesLanguageInPlace("/github"), true);
});
```

- [ ] **Step 2: A redirect tesztje (RED).** `next.config.test.ts` a gyökérben (a `npm test` globja nem fedi: a `package.json` `test` szkriptje kap egy harmadik mintát, `"next.config.test.ts"`):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import config from "./next.config.ts";

// Review Focus 2. Kills the old /archive/github links (bookmarks, the Google console) going 404.
test("the archive's old github tab redirects to /github for good", async () => {
  const redirects = await config.redirects!();
  assert.deepEqual(redirects, [{ source: "/archive/github", destination: "/github", permanent: true }]);
});
```

- [ ] **Step 3: Futtatás.** `node --experimental-strip-types --no-warnings --test lib/nav.test.ts next.config.test.ts` → FAIL mindkettő.

- [ ] **Step 4: A nav.** `lib/nav.ts`: `NavId`-ba `"github"`; a lista Library után: `{ id: "github", href: "/github", mobileMore: true, label: { hu: "GitHub repók", en: "GitHub repos" } },`; az `IN_PLACE_LANGUAGE`-be `/^\/github\/?$/`. A `nav-parts.tsx` ikon-térképébe `github: GitFork` (import a lucide-ból).

- [ ] **Step 5: A redirect.** `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  // The GitHub list lived under the archive before it got its own page; the query (filters) carries over.
  redirects: async () => [{ source: "/archive/github", destination: "/github", permanent: true }],
};
```

- [ ] **Step 6: A költöztetés.** `git mv` a három fájlra; `app/(app)/github/loading.tsx` = az `archive/(list)/loading.tsx` másolata (`ListSkeleton`). A `page.tsx` importja `./github-view`, a redirect `/login?next=/github` (a Task 1 után a proxy intézi, de a page saját redirectje marad, mint a többi oldalé). A `github-view.tsx`: a `githubHref` alapja `/github`; az `ArchiveTabs` import és render kikerül; az `archive-tabs.tsx` törölve; az `archive-view.tsx`-ből az `ArchiveTabs` import és a sor kikerül. A `github-view.test.ts` hrefjei `/github?rating=up&lang=Python` stb., és a `nav a[aria-current="page"]` állítás a két szűrő-chipre szűkül: `["/github?rating=heart&lang=Python", "/github?rating=heart&lang=Python"]`. A `preview/page.tsx` importja `@/app/(app)/github/github-view`.

- [ ] **Step 7: A shell-teszt.** A nav-linkek száma 6 (`[1, 1, 1, 1, 1, 1]`, Radar, AI companies, Library, GitHub, Archive, Collection) és a függő pontok száma 8; az archívum-kártya tesztjéből a `nav a[href^="/archive"]` tabs-állítás kikerül.

- [ ] **Step 8: Futtatás.** `node --experimental-strip-types --no-warnings --test lib/nav.test.ts next.config.test.ts app/components/shell.test.ts "app/(app)/github/github-view.test.ts"` → PASS. Próbák: a `mobileMore` törölve → bukik; a redirect `permanent: false` → bukik.

- [ ] **Step 9: CLAUDE.md.** Az App shell „Loading skeletons” sorában a `/archive/github` → `/github`; a „The GitHub tab” pont neve „The GitHub page (`/github`, …, a menu item; the old `/archive/github` redirects)”; az `IN_PLACE` és a route group mondatai eszerint. A „One list” sor: Radar, AI cégek, Library, GitHub repók, Keresés, Archívum, Gyűjtemény. A „Mobile” sor: „AI cégek, GitHub repók, Archívum and Gyűjtemény … those four”.

- [ ] **Step 10: Az öt ellenőrzés, commit.**

```bash
git add "app/(app)/github" next.config.test.ts
git commit -m "feat: give the github repos their own page and menu item" -- "app/(app)" app/components app/dev/preview lib/nav.ts lib/nav.test.ts next.config.ts next.config.test.ts package.json CLAUDE.md
```

---

### Task 5: A `config/` mappa

**Files:**
- Move: `lib/pipeline/feeds.ts` → `config/sources.ts`; `.env.example` → `config/.env.example`
- Modify: `lib/pipeline/collect.ts`, `lib/pipeline/collect.test.ts`, `lib/pipeline/daily.test.ts`, `lib/truthful-sites.test.ts`, `app/api/cron/daily/route.test.ts`, `package.json` (`dup`), `README.md`, `AGENTS.md`, `truthful_sites.md`, `ARCHITECTURE.md`, `CLAUDE.md`
- Create: `config/README.md` (a 7. feladat írja a tartalmát; itt egy egysoros placeholder NEM megengedett: a fájl a 7. feladatban jön létre)

- [ ] **Step 1: A költöztetés.** `git mv lib/pipeline/feeds.ts config/sources.ts && git mv .env.example config/.env.example`. A `config/sources.ts` első sorának importja `../data/digest-types.ts`; a fejléc-komment a `truthful_sites.md`-re `.claude/docs/truthful_sites.md`-ként hivatkozik majd (a 6. feladat), most `truthful_sites.md`.

- [ ] **Step 2: Az importok.** `collect.ts`: `from "../../config/sources.ts"`; `collect.test.ts` és `daily.test.ts`: `from "../../config/sources.ts"`; `truthful-sites.test.ts`: `from "../config/sources.ts"`; `app/api/cron/daily/route.test.ts`: `from "../../../../config/sources.ts"`.

- [ ] **Step 3: Eszközök.** `package.json` `dup`: `jscpd app lib config proxy.ts scripts …`. A `tsconfig.json` `include` már `**/*.ts`, nem változik. ESLint a gyökértől lintel, nem változik.

- [ ] **Step 4: Doksi.** `AGENTS.md` → Commands: `cp config/.env.example .env.local`. `README.md`: minden `.env.example` → `config/.env.example`, és az „Add a news feed” recept `config/sources.ts`-t nevez. `truthful_sites.md` 8. és 138. sora `config/sources.ts`. `ARCHITECTURE.md` Codemap: a `lib/pipeline/` sorából a `feeds.ts` ki, új sor: ``- `config/` holds the daily sources (`sources.ts`: the feeds, the Hacker News queries, the GitHub topics), the env template and the note on where every setting lives.`` `CLAUDE.md` 25. sora: „sources in `config/sources.ts`”.

- [ ] **Step 5: Futtatás.** `grep -rn "lib/pipeline/feeds\|feeds\.ts\|\.env\.example" --include=*.md --include=*.ts . | grep -v node_modules | grep -v "docs/superpowers"` → csak a `config/` találatok. Az öt ellenőrzés → zöld.

- [ ] **Step 6: Commit.**

```bash
git commit -m "refactor: move the daily sources and the env template into config/" -- config lib app/api/cron/daily/route.test.ts package.json README.md AGENTS.md truthful_sites.md ARCHITECTURE.md CLAUDE.md
```

---

### Task 6: A dokumentáció a `.claude/` alá

**Files:**
- Move: `CLAUDE.md` → `.claude/CLAUDE.md`; `ARCHITECTURE.md`, `CODE_STYLE.md`, `DESIGN.md`, `TESTING.md`, `TODO.md`, `truthful_sites.md` → `.claude/docs/`; `docs/ARCHIVE-MAP.md` → `.claude/docs/ARCHIVE-MAP.md`; `docs/superpowers/specs/*` → `.claude/docs/specs/`; `docs/superpowers/plans/*` → `.claude/docs/plans/`
- Create: `lib/test/doc-file.ts`
- Modify: `lib/design-excerpts.test.ts`, `lib/design-tokens.test.ts`, `lib/truthful-sites.test.ts`, `AGENTS.md`, `README.md`, `SECURITY.md`, `.claude/CLAUDE.md`, és minden `.md`, ami a régi útvonalakra mutat

- [ ] **Step 1: A segéd.** `lib/test/doc-file.ts`:

```ts
import { readFileSync } from "node:fs";

/** A file under .claude/docs/, CRLF-normalized. Throws ENOENT when the file isn't there: a moved doc must
 *  fail its test, never pass on an empty read. */
export const docFile = (name: string): string => readFileSync(new URL(`../../.claude/docs/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
```

- [ ] **Step 2: A tesztek (RED, mert a fájlok még nem költöztek).** `design-excerpts.test.ts`: `readRepoFile("DESIGN.md")` → `normalize(docFile("DESIGN.md"))` (a `readRepoFile` marad a forrásfájlokra). `design-tokens.test.ts`: `readRepoFile("DESIGN.md")` → `docFile("DESIGN.md")`. `truthful-sites.test.ts`: a `markdown` konstans `docFile("truthful_sites.md")`. Futtatás: `node --experimental-strip-types --no-warnings --test lib/design-excerpts.test.ts lib/design-tokens.test.ts lib/truthful-sites.test.ts` → FAIL, ENOENT (Review Focus 5: nem csendes).

- [ ] **Step 3: A költöztetés.** `mkdir -p .claude/docs/specs .claude/docs/plans`, majd `git mv` mindenre. A `.claude/CLAUDE.md` első sora `@../AGENTS.md`. A gyökérben nincs `CLAUDE.md`. Futtatás → PASS.

- [ ] **Step 4: A linkek.** Egy szkript (`scratchpad`) cseréli minden `.md`-ben: `docs/superpowers/specs/` → `.claude/docs/specs/`, `docs/superpowers/plans/` → `.claude/docs/plans/`, `docs/ARCHIVE-MAP.md` → `.claude/docs/ARCHIVE-MAP.md`; a gyökérbeli fájlokban (`README.md`, `AGENTS.md`, `SECURITY.md`) a `](ARCHITECTURE.md`, `](DESIGN.md`, `](TESTING.md`, `](CODE_STYLE.md`, `](TODO.md`, `](truthful_sites.md`, `](CLAUDE.md` → `](.claude/docs/…` illetve `](.claude/CLAUDE.md`; a `.claude/docs/` fájlokban az egymásra mutató linkek relatívak maradnak (`DESIGN.md` → `DESIGN.md`), a gyökérre mutatók (`README.md`, `AGENTS.md`, `SECURITY.md`, `app/…`, `lib/…`) `../../`-t kapnak. A README Codemap táblája kap egy sort: ``| [`.claude/`](.claude/) | `CLAUDE.md`, the deep reference Claude Code loads, and `docs/`: architecture, design, testing, style, the TODO, the trusted sources, and the specs and plans |``. Az `AGENTS.md` „Read next” listája az új útvonalakkal, és egy sor: „Specs and plans live in `.claude/docs/specs/` and `.claude/docs/plans/`.” A `docs/` mappa üres, törölve.

- [ ] **Step 5: Ellenőrzés.** `grep -rn "docs/superpowers\|](ARCHITECTURE.md\|](DESIGN.md\|](TESTING.md\|](CODE_STYLE.md\|](TODO.md\|](truthful_sites.md\|](CLAUDE.md" --include=*.md . | grep -v node_modules | grep -v "^./.claude/docs/"` → üres. Az `AGENTS.md` és a `.claude/CLAUDE.md` betöltése: egy új Claude Code munkamenetben a `/context` a `.claude/CLAUDE.md`-t mutatja (a tulajdonos ellenőrzi; ha nem, a gyökérbe egy egysoros `CLAUDE.md`: `@.claude/CLAUDE.md`). Az öt ellenőrzés → zöld.

- [ ] **Step 6: Commit.**

```bash
git commit -m "docs: move the documentation under .claude/ and read it from there in the tests" -- .claude docs AGENTS.md README.md SECURITY.md CLAUDE.md ARCHITECTURE.md CODE_STYLE.md DESIGN.md TESTING.md TODO.md truthful_sites.md lib/test/doc-file.ts lib/design-excerpts.test.ts lib/design-tokens.test.ts lib/truthful-sites.test.ts
```

---

### Task 7: `config/README.md`, a TODO, a Playwright-próbák és a zárás

**Files:**
- Create: `config/README.md`
- Modify: `.claude/docs/TODO.md`, `.claude/docs/ARCHITECTURE.md` (ha a 5–6. feladat után maradt elavult sor), `README.md` (a Setup lépése a `config/README.md`-re mutat)

- [ ] **Step 1: `config/README.md`.** A spec 3. szakasza szerint, angolul, a README stílusában: a táblázat (név · olvassa · kötelező · hol), a „Not env” lista (`model_settings`, `vercel.json` crons, `config/sources.ts` + `truthful_sites.md`, Supabase Auth: sign-ups off, Google provider, URL Configuration; Google Auth Platform: `/about`, `/privacy`), és a „How to change” három sora. A README „Environment” szakasza egy mondattal erre mutat.

- [ ] **Step 2: TODO.** A „Kész” alá: ``- [x] **Kódbázis-rend és config** (2026-10-11): a dokumentáció a `.claude/` alatt, a források és az env-leírás a `config/` alatt; belépés nélkül a `/` a landingre visz; az értékelés a repó kártyáján belül; a GitHub repók saját `/github` menüpontja; a napi futás törli a régi rangokat. Terv: [.claude/docs/plans/2026-10-11-codebase-order-and-config.md](plans/2026-10-11-codebase-order-and-config.md).`` A „Következő lépések” elejére a kiadás sora: a `codebase-order` PR, migráció nincs, élő próba: `/` kijelentkezve → `/about`, a `/github` lista, a holnapi futás pontszámai.

- [ ] **Step 3: Playwright az előnézeten** (`rm -rf .next/cache/turbopack`, `npm run dev`): `view=radar` a „GitHub Top 10” chippel 360/1024/1280-on: nincs vízszintes görgetés, minden `article`-ben egy `[role=group]`, 360-on a csoport a név alatt; `view=github` 360/1280; `/about`. Egy 80 karakteres repónév a fixture-ben (`previewGithub[1]` már ilyen) tördel.

- [ ] **Step 4: Az öt ellenőrzés, commit.**

```bash
git add config/README.md
git commit -m "docs: describe where every setting lives and close the codebase-order package" -- config/README.md README.md .claude/docs/TODO.md .claude/docs/ARCHITECTURE.md
```

---

## Önellenőrzés

1. **Spec-lefedettség:** 1.1–1.3 → 5–6. feladat; 2.1 → 1.; 2.2 → 3.; 2.3 → 4.; 2.4 → 2.; 3 → 7.; 4 (tesztek, Playwright) → minden feladat + 7.; 5 (kiadás) → 7. TODO-sora.
2. **Placeholder:** a `config/README.md` tartalma a spec 3. szakaszából másolandó, nem „TBD”.
3. **Típusok:** `signedOutTarget(pathname, search)`; `formatStars(number | null)`, `weekSpan(first, last)`; `RepoCard` propjai a 3. feladat szerint a 9–10. lépésben; a `deletes` tuple a 2. feladat 3. lépése szerint.
4. **Review Focus:** 1 → T1 teszt; 2 → T4 `next.config.test.ts`; 3 → T2 második teszt; 4 → T7 Playwright; 5 → T6 2. lépés.
