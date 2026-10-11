# G1 „Értékelés, GitHub-fül és Gyűjtemény” — terv

**Állapot:** jóváhagyva (2026-10-03), a beszélgetésben
**Sorrend:** a GitHub-rész első lépése (G1 → G2 „A hónap repói” → G3 „a chatbe dobott GitHub-link”), utána a keresés (a UX spec C mérföldköve).
**Alap:** [UX spec, 2026-09-24](2026-09-24-ux-signals-search-design.md) → 2. fejezet, a B mérföldkő. Ez a spec csak a kiegészítéseket és az eltéréseket rögzíti; ahol hallgat, a B spec érvényes.
**Kapcsolódó:** TODO.md → GitHub-radar, Olvasási jelzések; CLAUDE.md → Data contract, Routes, Server path.

## Cél

A tag megjelölhesse, mi volt hasznos és mi nem, a kedvenceit hetek múlva is megtalálja, és a GitHub-repókat hétről hétre, pontszámmal lássa.

**Siker:**
- Egy hír, egy poszt és egy repó egy kattintással 👎 / 👍 / ❤ értékelést kap, és az azonnal látszik. Hibánál visszaáll, és a hibás toast szól.
- A ❤-es tételek a Gyűjteményben vannak, hetekkel később is.
- A GitHub-fülön minden repó egyszer szerepel, a heti adataival és az értékeléssel együtt.
- A napi futás minden repónak pontszámot ad (0–100), és elmenti a csillagszámát és a nyelvét.

## 1. Adat (egy csak hozzáadó migráció, a tulajdonos futtatja)

- **`ratings` tábla** a B spec 2.2 szerint, változatlanul (`user_id`, `target_kind` ∈ `item` / `post` / `repo`, `target_id` ≤ 200 karakter, `value` ∈ −1 / 1 / 2, `updated_at`; elsődleges kulcs: `user_id, target_kind, target_id`). Az RLS ugyanaz, mint az `item_states`-é: mindenki csak a saját sorait látja és írja, a `user_id` alapértéke `auth.uid()`.
  - `target_id`: hírnél a `digest_items.id`, posztnál a `posts.id` szövegként, repónál a kisbetűs `owner/repo`.
- **`github_top`**: három új, nullázható oszlop: `stars int`, `language text`, `score smallint` (0–100, check). A régi sorokban üresek maradnak.
- **`github_repos` nézet** (`security_invoker`) a GitHub-fülhöz. Repónként (`lower(repo)`) egy sor:
  - az első és az utolsó hét;
  - hány különböző héten volt fent;
  - a legjobb helyezés;
  - a legutóbbi hét `repo`, `focus`, `url`, `stars`, `language` és `score` értéke.

## 2. A napi futás

- A GitHub-keresés a repó nyelvét (`language`) is elmenti; a `Repo` típus `language: string | null` mezőt kap.
- A válogató modell (`daily_curate`) minden választott repóhoz 0–100 pontot ad, ugyanazzal a mércével, mint a hírekhez. A séma: `github: { index, focus, score }`.
- A `toDigestRows` a `github_top` sorába a `stars`, a `language` és a `score` értéket is beírja.

## 3. Értékelés

- **`RatingControl`:** három gomb egy csoportban (👎 👍 ❤), `aria-pressed` állapottal, legalább 40 px-esek. A ház nyomás-szabályait követi (DESIGN.md → Pressed state).
  - Az aktív gomb újbóli megnyomása törli az értékelést.
  - A kattintás azonnal látszik. Hibánál az előző érték tér vissza, és a hibás toast jön (`toasts.show({ kind: "failed" })`).
  - A gyökér `data-rating` attribútumot kap (`down` / `up` / `heart`), ebből halványít a CSS.
- **Írás:** `POST /api/state`, új művelet: `set_rating` (`{ kind, id, value | null }`).
  - A bemenetet a `parseStateAction` ellenőrzi. A repó azonosítója kisbetűsre normalizálódik.
  - A `null` törli a sort, a többi érték upsert.
- **Kezdőérték:** a szerver adja, oldalanként egy lekérdezéssel (`getRatings(db, kind, ids)`), az RLS-sel.
  - A lapon belül adott értékelést egy modulszintű kliens-gyorsítótár őrzi. A Vissza a router-gyorsítótárból jön, és az a régit mutatná; a vezérlő felcsatoláskor a gyorsítótár értékét veszi előre (így oldja meg az `opened-posts.tsx` is).
- **Előnézet:** a vezérlő egy kontextusból kapja a küldőt. Az app shell a valódit adja (`postState`), az előnézet a memóriásat (`memorySend`, `fail=1`-gyel együtt), így valódi adathoz nem nyúl.
- **Hol van gombcsoport:**
  - a Radar-kártyák lábléce (a Top 3 és a hírfolyam), a „Később” és a „Teendő” mellett;
  - a GitHub Top 10 sorai a Radaron: a sor a linkből és mellette a gombcsoportból áll, mert link belsejébe nem tehető gomb;
  - a poszt eszköztára (`/library/[id]`);
  - a GitHub-fül és a Gyűjtemény sorai.
- **Eltérés a B spectől, 1:** a Library-lista kártyáin csak jelvény látszik (❤ / 👍 / 👎), gomb nem. A kártya egyetlen nagy link, és linkbe nem tehető gomb; értékelni a poszt oldalán lehet.
- **Eltérés a B spectől, 2:** a 👎-os tétel mindenhol halvány, szaggatott kerettel. A lista végére csak a szerver által rendezett listákon kerül (a Library és a GitHub-fül). A Radaron, az archivált heteken is, a helyén marad, csak halványabb.

## 4. A GitHub-fül

- **Útvonal:** `/archive/github`. Az archívum fejlécében két fül: „Hetek” (`/archive`) és „GitHub”.
- **Sorok:** repónként egy sor a `github_repos` nézetből: a név (linkként), a legutóbbi leírás, a nyelv, a csillagszám, a pontszám, az első és az utolsó hét, hány héten volt fent, a legjobb helyezés, és a gombcsoport.
- **Rendezés és szűrés:**
  - a legutóbbi hét szerint csökkenő sorrendben, a 👎-os repók a végén;
  - szűrhető értékelésre (❤ / 👍 / 👎 / értékeletlen) és nyelvre, query paraméterekkel (`?rating=`, `?lang=`);
  - oldalanként 30 repó, alul „Továbbiak” link (`?page=`).
- A fül nem kerül gyorsítótárba: a sorok az olvasó saját értékelésével együtt jönnek.

## 5. A Gyűjtemény

- **Útvonal:** `/collection`. A menüben a ma „hamarosan” jelű „Gyűjtemény” élesedik; mobilon a „Több” alá kerül (`mobileMore`).
- **Tartalom:** az olvasó ❤-es tételei, a legutóbb kedvelt elöl: hírek (a `digest_items` sora), posztok (a `posts` sora) és repók (a `github_repos` sora).
  - Az értékelések egy lekérdezésből jönnek, a tartalom típusonként egy `.in(...)` lekérdezésből.
  - Egy már nem létező tételhez (például egy törölt poszthoz) tartozó ❤ kimarad a listából.
- **Szűrő:** chipek: Mind / Hírek / Posztok / Repók (`?kind=`).
- **Sorok:** a cím linkként (a hír az eredetire, a poszt a `/library/<id>`-re, a repó a GitHubra), a típus és a hét, és a gombcsoport, így a szívet le is lehet venni.
- **Üres állapot:** egy rövid szöveg arról, hogyan kerül ide valami.

## 6. Adatszerződés

- A `GithubTopEntry` a mai `[repo, focus, url]` hármas helyett objektum lesz: `{ repo, focus, url, stars, language, score }` (az utolsó három lehet `null`).
- A zárt hetek gyorsítótárának kulcsa új verziót kap (`["closed-week", "v3"]`), mert a gyorsítótárban tárolt alak változik.

## Nem része a G1-nek

- „A hónap repói” és a napi csillagszám-mentés (G2).
- A chatbe dobott GitHub-link a Top 10-be vagy a kedvencek közé (G3).
- A keresés és a lapozás a Radaron (a UX spec C mérföldköve).
- A 👎-os hír hátrébb sorolása a Radaron.
- Közös (nem saját) kedvencek.

## Ellenőrzés

- **Egység- és route-tesztek, mutációs próbával:**
  - a `set_rating` ellenőrzése és normalizálása;
  - a route upsert- és törlés-ága, és a hibája;
  - a `getRatings`;
  - a Gyűjtemény és a GitHub-fül olvasásai;
  - a `toDigestRows` a pontszámmal, a csillagszámmal és a nyelvvel;
  - a repók gyűjtése a nyelvvel;
  - a `RatingControl` állapotai és visszaállása;
  - a 👎 a lista végén a szerver által rendezett listákon;
  - a menüpont élesedése.
- **Playwright az előnézeten**, új fixture-ökkel (értékelések, pontszámok, egy repó több héten): a három gomb a kártyán, a Top 10-ben, a poszton, a GitHub-fülön és a Gyűjteményben; `fail=1` mellett a visszaállás és a hibás toast; a jelvény a Library-kártyán; 360 és 1280 px-en vízszintes görgetés nélkül.
- **Doksi:** CLAUDE.md (Routes, Data contract, Server path, Database), DESIGN.md (`RatingControl`, a 👎 megjelenése), README.md (Migrations), TODO.md.
