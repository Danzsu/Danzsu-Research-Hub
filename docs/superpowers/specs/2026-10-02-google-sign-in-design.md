# Google-belépés — terv

**Állapot:** jóváhagyva (2026-10-02), a beszélgetésben: a Google-belépés a magic link *mellé* kerül, és az R3 előtt készül el
**Kapcsolódó:** CLAUDE.md → Auth; SECURITY.md → Auth and the invite gate; a kutatás forrásai lent

## Cél

A tagok egy kattintással, Google-fiókkal is beléphessenek, levélváltás nélkül. A meghívásos kapu ugyanúgy zárva marad, és a magic link tartalékként megmarad.

**Siker:**
- Egy meghívott tag, akinek a meghívott címe a Google-fiókja elsődleges címe, a „Belépés Google-lel” gombbal belép, és a `next` oldalra jut.
- Egy nem meghívott Google-fiók nem lép be, nem jön létre felhasználó, és a belépő oldal ezt mondja: „Ez a Google-fiók nincs meghívva.”
- Ha a Google-ablakban a tag megszakítja a belépést, a belépő oldal egy általános hibát mutat, nem azt, hogy „lejárt a link”.
- A magic link változatlanul működik.

## Ahogy a Supabase működik (a kutatás szerint)

- **Kikapcsolt regisztráció mellett** a Supabase nem hoz létre új felhasználót egy Google-belépésből, és ezt a hibát küldi vissza a visszatérési címre: `error=access_denied&error_code=signup_disabled`.
- **A meghívott tag** Google-identitását a Supabase magától hozzáköti a meglévő felhasználóhoz, ha a Google a címet ellenőrzöttnek jelöli (`email_verified`), és a cím pontosan egyezik. Ez a regisztráció tiltása mellett is működik, mert nem jön létre új felhasználó. Egy még el nem fogadott meghívó a Google-belépéssel megerősítődik.
- **A PKCE-folyamat:** a szerveroldali `signInWithOAuth` nem irányít át magától. Visszaadja a Google-címet (`data.url`), és a code-verifier sütit azonnal beírja. A meglévő `app/auth/callback` `?code=` ága (`exchangeCodeForSession`) már kezeli a visszatérést.
- **A `next`:** a belépő űrlap `safeNext`-je → a route `safeNext`-je → `/auth/callback?next=` → a Supabase hibánál és sikernél is megtartja a query-t → a callback még egyszer `safeNext`-et futtat rajta.

## A kód

- **Új: `app/auth/google/route.ts`** (POST):
  - beolvassa a `next`-et (`safeNext`);
  - meghívja a `signInWithOAuth({ provider: "google", options: { redirectTo } })`-t, ahol a `redirectTo` a callback a `next`-tel;
  - a válasz 303-mal a `data.url`-re irányít, hiba esetén a `/login?error=google`-ra.
  - A `/auth/` ma is nyilvános útvonal (`lib/public-paths.ts`), a `proxy.ts`-hez nem kell nyúlni.
- **Közös segéd** a callback-címhez (`/auth/callback?next=…`). A magic link és a Google route is ezt használja, így a két sor nem ismétlődik.
- **`app/auth/callback/route.ts`:** a hibák leképezése:
  - `error_code=signup_disabled` → `/login?error=not_invited`;
  - minden más `error` paraméter (például ha a tag megszakította) → `/login?error=google`;
  - a meglévő `verifyOtp`/`exchangeCodeForSession` hiba → `/login?error=1` (a mai „lejárt a link” szöveg).
- **`app/login/page.tsx`:**
  - felül egy „Belépés Google-lel / Continue with Google” gomb, egy külön űrlapon (POST `/auth/google`, rejtett `next`-tel);
  - alatta egy „vagy / or” elválasztó, majd a mai e-mailes űrlap;
  - a gomb a ház `brutal` változata, benne a Google változatlan, négyszínű „G” jele JSX-SVG-ként;
  - a három hibaüzenet az R2 közös hibasorát (`ErrorLine`) kapja, kétnyelvűen, ahogy a lap többi szövege.
- **Új függőség, új környezeti változó nincs.** A Google kliens azonosítója és titka a Supabase-be kerül, nem a Vercelbe.

## Biztonság

- **A kapu nem változik:** a regisztráció ki van kapcsolva, ezért idegen fiók nem hoz létre felhasználót.
- **Az új kockázat:**
  - A Google csak a `@gmail.com` és a Google Workspace-címekért kezeskedik. Egy más szolgáltatónál lévő (például Outlook-os) címnél az `email_verified` elavult lehet, mert a cím gazdát cserélhetett.
  - A Supabase mégis összeköti, ezért az, akinek ilyen címre van Google-fiókja, beléphet a meghívott tag nevében.
  - **A szabály:** tagot csak Gmail- vagy Workspace-címen hívunk meg. Más címen meghívott tag a magic linket használja.
- **A rendszer-fiók** (`RADAR_MIRROR_USER_ID`, egy `+radar` Gmail-alias) nem érhető el Google-lel: egy alias soha nem egy Google-fiók elsődleges címe.
- **Egy tag eltávolítása** a felhasználó törlése vagy tiltása, mert a felhasználó minden belépési módja vele együtt megy.
- Mindezt a SECURITY.md → Auth and the invite gate rögzíti.

## A tulajdonos teendői, sorrendben

1. **Google Cloud Console → Google Auth Platform:**
   - Branding: az app neve „NEON NEWS RADAR”, és egy támogatási e-mail-cím;
   - Audience: External;
   - Data access: az `openid`, `email` és `profile` scope;
   - Clients: egy Web application kliens, ezzel az Authorized redirect URI-val: `https://<projekt-ref>.supabase.co/auth/v1/callback`;
   - a Client ID-t és a Client secretet csak a Supabase-be másold, ide ne.
2. **Supabase → Authentication → Sign In / Providers → Google:**
   - bekapcsolás, majd az ID és a titok beillesztése;
   - a „Allow new users to sign up” maradjon *kikapcsolva*, az Email szolgáltató maradjon bekapcsolva.
3. **Supabase → Authentication → URL Configuration:**
   - a Site URL marad a production domain;
   - a Redirect URLs között legyen ott a `http://localhost:3000/**` a helyi próbához.
4. **A tagok meghívott címe** legyen a Google-fiókjuk elsődleges címe (Gmail vagy Workspace).
5. **A deploy után három próba:**
   - egy tag belép;
   - egy nem meghívott fiók elutasítást kap;
   - egy megszakított belépés a hibaüzenetet hozza.

A testreszabott domain a beleegyező képernyőn (`<projekt-ref>.supabase.co` helyett) a Supabase fizetős kiegészítője, és saját domaint kívánna. Nem része ennek a tervnek.

## Ellenőrzés

- **Route-tesztek** a route-teszt rétegen (`routeStub`), mutációs próbával:
  - a `/auth/google` 303-mal a Google-címre irányít, és a `redirectTo` a callback a `safeNext`-elt `next`-tel;
  - hibánál a `/login?error=google` jön;
  - a callback a `signup_disabled`-et `not_invited`-re, minden más `error`-t `google`-ra képez;
  - a mai sikeres és sikertelen ágak nem változnak.
- **A belépő oldal render-tesztje:** két űrlap, a Google-űrlap rejtett `next`-je, és a három hibaüzenet mindkét nyelven.
- **Élesben:** a tulajdonos „A tulajdonos teendői” 5. pontjának három próbája.

## Nem része

- Google One Tap / `signInWithIdToken`: Google-szkriptet kell betölteni a böngészőbe, nonce-ot kezelni és CSP-t módosítani, egyetlen átirányításért.
- A magic link kivezetése.
- Saját domain a Supabase-hez.

## Források

- Az identitások összekötése: https://supabase.com/docs/guides/auth/auth-identity-linking
- Google-belépés Supabase-ben: https://supabase.com/docs/guides/auth/social-login/auth-google
- PKCE: https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Átirányítási címek: https://supabase.com/docs/guides/auth/redirect-urls
- Hibakódok: https://supabase.com/docs/guides/auth/debugging/error-codes
- A Google `email_verified`-ről: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
