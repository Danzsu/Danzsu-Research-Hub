# Kódbázis-rend, config és a GitHub-rész javításai — specifikáció

Dátum: 2026-10-11. Jóváhagyva a tervezés során (a tulajdonos: „Mehet”). Ez a három alprojektből az 1. és a 3., egy branchen (`codebase-order`). A 2a–2d csomagok külön specet kapnak.

## Cél

1. A repó olvasható legyen egy új szem számára is: a dokumentáció egy helyen (`.claude/`), a források és a környezet beállítása egy helyen (`config/`), a gyökérben csak az, amit a GitHub és a Claude Code ott keres.
2. Négy, élesben látható hiba javítása: a főoldal belépés nélkül a landingre vigyen; a 👎 👍 ❤ a repó kártyáján belül legyen; a GitHub repók önálló menüpontot kapjanak; a napi futás ne hagyjon régi rangokat a heti Top 10-ben.

## Döntések (a tervezés során egyeztetve)

- **Gyökérben marad:** `README.md` (a repó címlapja), `SECURITY.md` (a GitHub Security füle), `AGENTS.md` (más agentek ott keresik; a `next dev` ide írja a Next-blokkját). Minden más dokumentáció a `.claude/docs/` alá megy.
- **A `CLAUDE.md` `.claude/CLAUDE.md` lesz.** A Claude Code ezt automatikusan betölti; a gyökérbeli példány megszűnik, hogy ne töltődjön be kétszer. Első sora `@../AGENTS.md` (az import a fájl mappájához képest oldódik fel).
- **A Next-szerkezet marad:** `app/`, `lib/`, `components/`, `hooks/`, `public/`, `scripts/`, `supabase/`, `vendor/`. A `vercel.json`, a `next.config.ts`, a `tsconfig.json`, az ESLint- és a PostCSS-config a gyökérben marad, mert az eszközök ott keresik. Az `.env.local` a gyökérben marad (a Next ott olvassa), csak az `.env.example` költözik.
- **Nincs GitHub Environments.** A Vercel az egyetlen titok-forrás (Production és Preview), a CI nem kap titkot.
- **Főoldal:** belépés nélkül a `/` a landinget mutatja; belépve a Radart. Minden más védett oldal továbbra is a `/login?next=…`-re megy.
- **A repó kártyáján a név a link** (új lapon nyílik), a kártya maga nem link, mert gomb nem lehet linkben.
- **Elvetve:** feature-mappás átszervezés (`features/radar`…), `.claude/rules/` bevezetése (később, ha kell), új design-rendszer.

## 1. Mappaszerkezet

### 1.1 A célállapot

```
.claude/
  CLAUDE.md                ← a mai CLAUDE.md; első sora: @../AGENTS.md
  docs/
    ARCHITECTURE.md
    CODE_STYLE.md
    DESIGN.md
    TESTING.md
    TODO.md
    truthful_sites.md
    ARCHIVE-MAP.md         ← a mai docs/ARCHIVE-MAP.md
    specs/                 ← a mai .claude/docs/specs/
    plans/                 ← a mai .claude/docs/plans/
config/
  sources.ts               ← a mai lib/pipeline/feeds.ts, változatlan exportokkal
  .env.example             ← a mai .env.example
  README.md                ← új: mi hol van beállítva (3. szakasz)
AGENTS.md  README.md  SECURITY.md
```

A `docs/` mappa és a gyökérbeli `CLAUDE.md`, `.env.example` megszűnik. A költöztetés `git mv`, hogy a történet megmaradjon.

### 1.2 Hivatkozások

- `AGENTS.md` → „Read next”: a linkek a `.claude/docs/…`-ra mutatnak; a „Commands” a `cp config/.env.example .env.local`-t írja.
- `README.md`: minden belső link az új útvonalra; a „Add a news feed” recept a `config/sources.ts`-t nevezi meg.
- `.claude/CLAUDE.md`: az `AGENTS.md` importja `@../AGENTS.md`; a szövegben a `feeds.ts` → `config/sources.ts`.
- `ARCHITECTURE.md` → Codemap: a `config/` és a `.claude/` új sorai; a `lib/pipeline/` sorából a `feeds.ts` kikerül.
- A `.claude/docs/` útvonalra mutató linkek (TODO.md, a specek és tervek egymásra) frissülnek. Egy `grep -rn "docs/superpowers\|lib/pipeline/feeds"` a végén üres.
- A superpowers-skillek alapértelmezett helye a `.claude/docs/`; a „User preferences for plan location override this default” alapján a továbbiakban a `.claude/docs/specs/` és `.claude/docs/plans/` a hely. Ezt az `AGENTS.md` egy sora rögzíti.

### 1.3 Kód és eszközök

- **`config/sources.ts`:** a `feeds`, a `DEFAULT_FEED_LIMIT`, a `hnQueries`, a `hnNames` és a `githubTopics` export változatlan névvel. A `lib/pipeline/collect.ts` importja `../../config/sources.ts` (relatív `.ts`, a `lib`-szabály szerint). A `lib/truthful-sites.test.ts` ugyanonnan importál.
- **A doksit olvasó tesztek** (`lib/design-excerpts.test.ts`, `lib/design-tokens.test.ts`, `lib/truthful-sites.test.ts`): egy közös `docFile(name)` segéd a `lib/test/`-ben (`new URL("../../.claude/docs/" + name, import.meta.url)`), hogy a hely egy sorban legyen. A `readRepoFile` megmarad a gyökér fájljaira (`app/globals.css`).
- **`tsconfig.json` `include`:** a `config/**/*.ts` bekerül. **ESLint:** a `config/` a lintelt mappák között. **`npm run dup`:** a `jscpd` paraméterei közé bekerül a `config`. **`npm test`:** nem változik (a `config/`-ban nincs teszt).
- **`lib/client-bundle.test.ts`:** a kliens-gráf sétája a `config/`-ot is feloldja (a `resolveImport` már kezeli a relatív útvonalakat).

## 2. A négy javítás

### 2.1 Főoldal belépés nélkül

- Új tiszta függvény a `lib/public-paths.ts`-ben:
  ```ts
  /** Where a signed-out request goes: the landing page for the home, otherwise sign-in with the way back. */
  export function signedOutTarget(pathname: string, search: string): string
  ```
  `/` → `/about`; minden más → `/login?next=<encodeURIComponent(pathname + search)>`.
- A `proxy.ts` ezt hívja a mai három sor helyett. A `/about` és a `/privacy` továbbra is nyilvános (`isPublicPath`).
- Belépve a `/` a Radar marad. A landing „Belépés” gombja a `/login`-ra visz, a belépés után a `/`-ra (a `SignInForms next="/"` marad).
- Teszt: `signedOutTarget("/", "")` → `/about`; `signedOutTarget("/library", "?x=1")` → `/login?next=%2Flibrary%3Fx%3D1`; `signedOutTarget("/", "?a=1")` → `/about` (a query elvész, nincs mit visszavinni).

### 2.2 Értékelés a repó kártyáján belül

- **Új közös komponens:** `app/components/repo-card.tsx`, `RepoCard`:
  ```ts
  { rank?: number; repo: string; url: string; focus: string; meta: ReactNode; target: RatingTarget; initial: RatingValue | null; className?: string }
  ```
  - egy `article` 2 px ink kerettel, `bg-paper`, `p-4`, a `dislikedClass`-szal és a `press`-emeléssel (hover: `-translate-y-0.5`, `motion-safe`);
  - fent: a `rank` display-számmal (ha van), mellette a név mono félkövérrel, **linkként** (`target="_blank" rel="noreferrer"`, `focus-ring`, `min-h-10`, a név mellett `ExternalLink` ikon), `[overflow-wrap:anywhere]`;
  - alatta a `focus` (a leírás), `text-sm text-ink/55`;
  - alul egy sor: balra a `meta` mono szöveg, jobbra a `RatingControl`; `flex-wrap`, 360 px-en a csoport a sor alá kerül, a szöveg `min-w-48`.
- **A Radar Top 10** (`GithubTopList`): a `RepoCard`-ot rendereli, `meta` = `nyelv · ★ csillag · pontszám/100` (a hiányzó érték „—”; a csillag tömör, „152K”). A hover-fill (narancs kártya) megszűnik, az emelés marad: a kártya nem link, a narancs fill linkre volt jogos.
- **A `/github` oldal sorai:** ugyanez a `RepoCard`, `rank` nélkül, `meta` = `nyelv · ★ · pontszám · W36–W39 · 3 hét · legjobb #2`. A mai `li`-struktúra a kártyára cserélődik.
- A `compact` csillagformázás és a hét-címke a `RepoCard` modulja mellett egy kis `lib/repo-format.ts`-be kerül (`formatStars`, `weekLabel`), mert a Top 10 és a GitHub-oldal is használja; a `github-view.tsx` mai helyi segédei megszűnnek.
- DESIGN.md: a Top 10 kártya kivonata újramásolva; a „Pressed state” szakaszban a „GitHub rows carry `press`” mondat a kártyára vonatkozik.

### 2.3 Önálló GitHub menüpont

- **Útvonal:** `/github`. Fájlok: `app/(app)/github/page.tsx` (a mai `archive/(list)/github/page.tsx`), `app/(app)/github/github-view.tsx` (a mai `archive/github-view.tsx`), `app/(app)/github/loading.tsx` (`ListSkeleton`). A `(list)` route group itt nem kell, mert a `/github` alatt nincs aloldal.
- **Menü (`lib/nav.ts`):** új sor `{ id: "github", href: "/github", mobileMore: true, label: { hu: "GitHub repók", en: "GitHub repos" } }` a Library után. A `NavId` bővül. Ikon: `GitFork` (a lucide 1.46-ban nincs `Github` ikon). Az `IN_PLACE_LANGUAGE` kap egy `/^\/github\/?$/` mintát. Mobilon a „Több” alatt (AI cégek, GitHub repók, Archívum, Gyűjtemény).
- **Az archívum:** az `ArchiveTabs` komponens megszűnik, az `ArchiveView` ismét csak a hetek listája. A `FilterChips` marad (a GitHub szűrői és a Gyűjtemény).
- **URL-ek:** a `githubHref` `/github?…`-t ad. A régi `/archive/github` egy állandó redirect a `next.config.ts` `redirects()`-ében (`/archive/github` → `/github`, a query-vel együtt).
- **Hero:** eyebrow `REPOS / REPÓK`, cím `GITHUB`, a lead marad.
- **Előnézet:** a `view=github` ugyanúgy működik.
- A G1 Gyűjteményének repó-sora nem változik.

### 2.4 Régi rangok törlése

- A `runDaily` a `github_top` upsertje után: `db.from("github_top").delete().eq("issue_id", week.id).gt("rank", top.length)`. Üres `top` esetén nem töröl (a lista 0 hosszú lenne, és egy modellhiba nem törölheti ki a hetet). A hibát dobja, mint az upsertét.
- Teszt (`daily.test.ts`): a `fakeDb` `deletes` naplójában egy bejegyzés `github_top`-ra `issue_id = <hét>` és `rank > N` szűrővel; üres listánál nincs törlés. A `fakeDb` törlés-láncának a `gt` szűrőt ismernie kell (ma `eq`/`is`); ez a fake bővítése.
- A mai „—” pontszámokhoz nem kell kód: az upsert `(issue_id, rank)` kulcsra minden nap felülírja mind a 10 sort.

## 3. `config/README.md`

Rövid, táblázatos. Tartalma:

1. **Környezeti változók** (a `.env.example` minden sora): név · ki olvassa (fájl) · kötelező-e · hol van beállítva. Hely mindnél: Vercel → Settings → Environment Variables, Production és Preview; helyben `vercel env pull --environment=production .env.local`.
   | Név | Olvassa | Kötelező |
   | --- | --- | --- |
   | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | `lib/supabase/server.ts`, `proxy.ts` | igen |
   | `SUPABASE_SECRET_KEY` | `lib/supabase/server.ts` (admin kliens) | igen |
   | `GEMINI_API_KEY` | `lib/llm.ts` | igen |
   | `GROQ_API_KEY` | `lib/llm.ts` | nem (Gemini-tartalék) |
   | `CRON_SECRET` | `lib/api.ts` | igen |
   | `GITHUB_TOKEN` | `lib/pipeline/fetch.ts` | nem |
   | `RADAR_MIRROR_USER_ID` | `lib/pipeline/mirror.ts` | nem (nélküle nincs tükör) |
2. **Ami nem env:** a `model_settings` tábla (melyik feladat melyik modellen, SQL Editorban módosítható), a cronok (`vercel.json`), a források (`config/sources.ts` + `truthful_sites.md`), a Supabase Auth beállításai (sign-up ki, Google provider, URL-ek), a Google Auth Platform mezői (`/about`, `/privacy`).
3. **Hogyan változtass:** egy env-változó hozzáadása = `.env.example` + ez a táblázat + Vercel; egy forrás hozzáadása = a README receptje.

## 4. Tesztelés

- Az öt ellenőrzés: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`.
- Új vagy módosult tesztek: `public-paths.test.ts` (`signedOutTarget`), `repo-card.test.ts` (a gombcsoport a kártyán belül, egyetlen `a` a névre, `target=_blank`), `github-view.test.ts` (a hrefek `/github?…`), `nav.test.ts` (az új sor, mobil „Több”, nyelvváltás helyben), `shell.test.ts` (a Top 10 a `RepoCard`-on át; a nav linkjeinek száma és a függő pontok), `daily.test.ts` (rang-törlés), a doksi-tesztek az új útvonalon.
- Mutációs próbák: a `signedOutTarget` `/`-ága; a `RepoCard` link a kártyára tolva; a rang-törlés feltétele (`top.length` helyett 10, üres lista); a nav `mobileMore`.
- Playwright az előnézeten: a Top 10 kártyák 360/1024/1280-on (nincs vízszintes görgetés, a csoport 360-on a sor alatt), a `view=github`, az `/about`.
- **Élő próba a deploy után:** `/` kijelentkezve → `/about`; a menüben a GitHub repók; a `/github` listázza a korábbi hetek repóit (ha üres, a Supabase-ben a `github_repos` nézet lekérdezése a következő lépés); a holnapi futás után a Top 10 pontszámai látszanak.

## 5. Kiadás

Egy branch (`codebase-order`), egy PR a `main`-re. Migráció nincs. A deploy után az élő próbák. A TODO.md „Kész” alá egy sor; a 2a spec ezután jön.
