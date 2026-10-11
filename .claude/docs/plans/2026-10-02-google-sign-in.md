# Google-belépés — implementációs terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tagok Google-fiókkal is beléphessenek a magic link mellett, a meghívásos kapu változatlan, és az egészet route-, render- és Playwright-próbák rögzítik. Utána a push előtt egy teljes Playwright-végigjátszás jön az egész appon.

**Architecture:**
- Új `POST /auth/google` route: a Supabase `signInWithOAuth`-ja (PKCE) a Google-címet adja vissza, a route 303-mal oda irányít.
- A meglévő `/auth/callback` `?code=` ága fogadja a visszatérést. Az új ág a Google elutasítását (`error`, `error_code=signup_disabled`) a belépő oldal hibáira képezi le.
- A visszatérési cím és a hibás belépő-cím egy-egy közös segéd (`authCallback`, `loginWithError`, a `lib/pipeline/util.ts`-ben).
- A belépő oldal Google-gombot és az R2 közös hibasorát (`ErrorLine`) kapja.

**Tech Stack:** Next.js 16.3.4 route handlers, @supabase/ssr 0.12.7 / supabase-js 2.116.0 (PKCE), `node --test` a route-teszt réteggel (`lib/test/route-hooks.ts`) és a render harness-szel (`lib/test/render.ts`), Playwright MCP.

**Spec:** `.claude/docs/specs/2026-10-02-google-sign-in-design.md`

## Global Constraints

- **AGENTS.md hard rules:**
  - új függőség és új környezeti változó nincs;
  - nincs `NEXT_PUBLIC_` és nincs `dangerouslySetInnerHTML`;
  - a `lib/`-ben relatív `.ts` import;
  - komponensenként egy `{ hu, en }` copy-objektum;
  - nincs push;
  - commit: Conventional Commits, kisbetűs, felszólító mód, explicit pathspec, attribution nélkül.
- **Commit előtt** mind az öt ellenőrzés zöld: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup` (lint 0/0, `Found 0 clones.`).
- **Tesztek:**
  - minden új teszt egy mutációs próbával bizonyítja, hogy nem üres;
  - a mockolt `console` hívásszámát ellenőrizni kell;
  - kiinduló szám: **707**.
- **Szó szerint:**
  - a route: `POST /auth/google`;
  - a hibakódok a belépő oldalon: `error=not_invited`, `error=google`, `error=1`;
  - a Supabase hibakódja: `error_code=signup_disabled`;
  - a `signInWithOAuth` opciói: `{ provider: "google", options: { redirectTo, skipBrowserRedirect: true } }`.
  - Szövegek:
    - „Belépés Google-lel” / „Continue with Google”;
    - „vagy” / „or”;
    - „Ez a Google-fiók nincs meghívva.” / „This Google account isn't invited.”;
    - „A Google-belépés nem sikerült, próbáld újra.” / „Google sign-in failed, try again.”;
    - a mai „A link lejárt vagy érvénytelen.” / „The link expired or is invalid.” marad.
- **Valódi adat és szolgáltatás:** a Playwright-próbák semmilyen valódi szolgáltatást nem érhetnek el.
  - A Supabase felé menő minden böngészős kérést a `page.route` elfog és megszakít.
  - Az e-mailes űrlapot soha nem küldjük el, mert az valódi levelet küldene.
  - A preview-n kívül csak a `/login` és az `/auth/*` útvonalat nyitjuk meg.

## Review Focus

1. **A `next` lekérdezéssel és horgonnyal együtt** (`/library/12?text=hu#b-3`) végigmegy a Google-körön, egyetlen kódolással. A 2. feladat tesztje rögzíti.
2. **A callback egyszerre kap `error`-t és `code`-ot:** az `error` nyer, és nem nyílik munkamenet. A 3. feladat tesztje rögzíti.
3. **Egy veszélyes `next` a hibaágon** (`//evil.test`) a hibás belépő-címben `/` lesz. A 3. feladat tesztje rögzíti.
4. **Ismeretlen `error` érték a belépő oldalon** (`?error=valami`): a mai „lejárt a link” szöveg jelenik meg, nem üres riasztás. A 4. feladat tesztje rögzíti.
5. **A böngésző valóban PKCE-vel indul:** a Supabase-címben ott van a `provider=google`, a `code_challenge`, és a `redirect_to` a helyi callback a `next`-tel. A code-verifier süti beíródik. Az 5. feladat Playwright-próbája méri.

## Fájlok

| Fájl | Feladat | Mi változik |
| --- | --- | --- |
| `lib/pipeline/util.ts` (+ teszt) | 1 | `authCallback`, `loginWithError` |
| `lib/test/fake-auth.ts` (új) | 1 | az auth route-ok Supabase-stubja és a kérés-építő |
| `app/auth/login/route.ts` (+ új teszt) | 1 | a callback-cím a közös segédből |
| `app/auth/google/route.ts` (új, + teszt) | 2 | a Google-belépés indítása |
| `app/auth/callback/route.ts` (+ új teszt) | 3 | a Google elutasításainak leképezése, a `next` megtartása hibánál |
| `app/login/page.tsx` (+ új teszt) | 4 | Google-gomb, elválasztó, `ErrorLine`, copy-objektum |
| `CLAUDE.md`, `SECURITY.md`, `README.md`, `DESIGN.md`, `TODO.md` | 4, 6 | a Google-belépés leírása, a kockázat, a beállítás |

---

### Task 1: Közös segédek és a magic link tesztje

**Files:** Modify `lib/pipeline/util.ts` (a `safeNext` után), `lib/pipeline/util.test.ts`, `app/auth/login/route.ts`. Create `lib/test/fake-auth.ts`, `app/auth/login/route.test.ts`.

**Interfaces — Produces:**
- `authCallback(origin: string, next: string): string`;
- `loginWithError(origin: string, reason: "1" | "google" | "not_invited", next: string): string`;
- `fakeAuth(answers?)`, amely egy `[method, arg][]` hívásnaplót ad vissza;
- `authRequest(pathAndQuery, form?)`, amely egy `NextRequest`-alakú kérést ad.

- [ ] **Step 1: A segédek tesztje (RED).** A `lib/pipeline/util.test.ts` importjába: `authCallback, loginWithError`. A fájl végére:

```ts
// Google sign-in spec. Kills `next` dropped, not encoded (a `?` or `#` in it would end the callback's own
// query), or the origin ignored (a local sign-in would come back to production).
test("authCallback and loginWithError carry the post-login target, encoded once", () => {
  assert.equal(authCallback("http://localhost:3000", "/library/12?text=hu#b-3"), "http://localhost:3000/auth/callback?next=%2Flibrary%2F12%3Ftext%3Dhu%23b-3");
  assert.equal(loginWithError("https://radar.test", "not_invited", "/library"), "https://radar.test/login?error=not_invited&next=%2Flibrary");
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/util.test.ts`. Várt: SyntaxError (nincs ilyen export).

- [ ] **Step 2: A segédek (GREEN).** A `lib/pipeline/util.ts`-ben, a `safeNext` után:

```ts
/** Where a sign-in comes back to: /auth/callback with the post-login target (already through safeNext). */
export function authCallback(origin: string, next: string): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);
  return callback.toString();
}

/** The login page after a failed sign-in: the reason the page explains (app/login/page.tsx), and the target kept. */
export function loginWithError(origin: string, reason: "1" | "google" | "not_invited", next: string): string {
  const login = new URL("/login", origin);
  login.searchParams.set("error", reason);
  login.searchParams.set("next", next);
  return login.toString();
}
```

- [ ] **Step 3: Az auth-stub.** `lib/test/fake-auth.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { resetRoute, routeStub, signedIn } from "./route-hooks.ts";

type AuthMethod = "signInWithOAuth" | "exchangeCodeForSession" | "verifyOtp" | "signInWithOtp";
type AuthAnswer = { data?: unknown; error: { message: string } | null };

const SUCCESS: Record<AuthMethod, AuthAnswer> = {
  signInWithOAuth: { data: { provider: "google", url: "https://ref.supabase.test/auth/v1/authorize?provider=google" }, error: null },
  exchangeCodeForSession: { data: {}, error: null },
  verifyOtp: { data: {}, error: null },
  signInWithOtp: { data: {}, error: null },
};

/** The auth routes' Supabase client: every auth call lands in the returned log with its argument, and
 *  answers `answers[method]`, or success. Route tests' createClient() hands out the reader's db, so this
 *  sets one up although these routes run signed out. */
export function fakeAuth(answers: Partial<Record<AuthMethod, AuthAnswer>> = {}): [AuthMethod, unknown][] {
  resetRoute();
  const calls: [AuthMethod, unknown][] = [];
  const method = (name: AuthMethod) => async (arg: unknown) => {
    calls.push([name, arg]);
    return answers[name] ?? SUCCESS[name];
  };
  const auth = Object.fromEntries((Object.keys(SUCCESS) as AuthMethod[]).map((name) => [name, method(name)]));
  routeStub.reader = signedIn({ auth } as unknown as SupabaseClient, "visitor");
  return calls;
}

/** A GET with a query, or a POSTed form, as the auth routes read it: a Request with Next's `nextUrl`. */
export function authRequest(pathAndQuery: string, form?: Record<string, string>): NextRequest {
  const url = `http://localhost${pathAndQuery}`;
  const request = form ? new Request(url, { method: "POST", body: new URLSearchParams(form) }) : new Request(url);
  return Object.assign(request, { nextUrl: new URL(url) }) as unknown as NextRequest;
}
```

- [ ] **Step 4: A magic link tesztje.** `app/auth/login/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";

const { POST } = await import("./route.ts");

// The magic link, unchanged, now through authCallback. Kills shouldCreateUser flipped (an uninvited
// address would get an account), `next` dropped or not through safeNext, the address not trimmed and
// lowercased, and any answer that differs for an unknown address (it would enumerate members).
test("POST /auth/login asks for an invite-only link back to the callback with a safe next, and always answers the same", async () => {
  const calls = fakeAuth();
  const sent = await POST(authRequest("/auth/login", { email: " Tag@Example.Test ", next: "/library?x=1" }));
  assert.deepEqual(calls, [["signInWithOtp", { email: "tag@example.test", options: { shouldCreateUser: false, emailRedirectTo: "http://localhost/auth/callback?next=%2Flibrary%3Fx%3D1" } }]]);
  const evil = fakeAuth();
  await POST(authRequest("/auth/login", { email: "a@b.test", next: "//evil.test" }));
  assert.deepEqual(evil, [["signInWithOtp", { email: "a@b.test", options: { shouldCreateUser: false, emailRedirectTo: "http://localhost/auth/callback?next=%2F" } }]]);
  const none = fakeAuth();
  const notAnEmail = await POST(authRequest("/auth/login", { email: "nincs-kukac" }));
  assert.deepEqual(none, []);
  for (const response of [sent, notAnEmail]) {
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "http://localhost/login?sent=1");
  }
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test app/auth/login/route.test.ts`. Várt: zöld már most. Ez karakterizáló teszt, a mai viselkedést rögzíti a refaktor előtt. Ha piros, a stub a hibás, nem a route.

- [ ] **Step 5: A route a közös segédet használja.** Az `app/auth/login/route.ts`-ben az import mellé: `import { authCallback } from "@/lib/pipeline/util";`. A két `callback` sor törlődik, az `emailRedirectTo` pedig ez lesz: `authCallback(request.nextUrl.origin, next)`.

- [ ] **Step 6: Próbák, ellenőrzés, commit.**
  - **Próbák:** a `shouldCreateUser: false` → `true`; a `next` nélküli `authCallback`; a `toLowerCase()` törlése. Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git add lib/test/fake-auth.ts app/auth/login/route.test.ts
git commit -m "test: pin the magic link route and share the sign-in return address" -- lib/pipeline/util.ts lib/pipeline/util.test.ts lib/test/fake-auth.ts app/auth/login/route.ts app/auth/login/route.test.ts
```

### Task 2: A Google-belépés indítása

**Files:** Create `app/auth/google/route.ts`, `app/auth/google/route.test.ts`.

**Interfaces — Consumes:** `authCallback`, `loginWithError`, `fakeAuth`, `authRequest` (Task 1).

- [ ] **Step 1: Teszt (RED).** `app/auth/google/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";

const { POST } = await import("./route.ts");
const start = (next: string) => POST(authRequest("/auth/google", { next }));

// Google sign-in spec and Review Focus 1. Kills the wrong provider, a redirectTo without the callback or
// its safe next (a query and hash must survive, encoded once), PKCE's browser redirect left on, and an
// answer that doesn't follow Supabase's URL.
test("POST /auth/google starts Google's PKCE sign-in back to the callback with a safe next, and follows its URL", async () => {
  const calls = fakeAuth();
  const response = await start("/library/12?text=hu#b-3");
  assert.deepEqual(calls, [["signInWithOAuth", { provider: "google", options: { redirectTo: "http://localhost/auth/callback?next=%2Flibrary%2F12%3Ftext%3Dhu%23b-3", skipBrowserRedirect: true } }]]);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://ref.supabase.test/auth/v1/authorize?provider=google");
  const evil = fakeAuth();
  await start("//evil.test");
  assert.deepEqual(evil, [["signInWithOAuth", { provider: "google", options: { redirectTo: "http://localhost/auth/callback?next=%2F", skipBrowserRedirect: true } }]]);
});

// Kills a failed start sent on to a missing URL, or to the "link expired" message instead of Google's.
test("POST /auth/google answers the login page's google error when Supabase can't start it, keeping next", async () => {
  for (const answer of [{ data: { provider: "google", url: null }, error: { message: "provider is not enabled" } }, { data: { provider: "google", url: null }, error: null }]) {
    fakeAuth({ signInWithOAuth: answer });
    const response = await start("/library");
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "http://localhost/login?error=google&next=%2Flibrary");
  }
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test app/auth/google/route.test.ts`. Várt: ERR_MODULE_NOT_FOUND.

- [ ] **Step 2: A route (GREEN).** `app/auth/google/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { authCallback, loginWithError } from "@/lib/pipeline/util";
import { createClient, safeNext } from "@/lib/supabase/server";

/** "Belépés Google-lel": Supabase's Google sign-in (PKCE; the verifier lands in a cookie here). Sign-ups
 *  are off, so Supabase refuses an uninvited account and creates nothing; the callback says why. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const origin = request.nextUrl.origin;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authCallback(origin, next), skipBrowserRedirect: true },
  });
  return NextResponse.redirect(error || !data.url ? loginWithError(origin, "google", next) : data.url, 303);
}
```

- [ ] **Step 3: Futtatás.** Várt: zöld.

- [ ] **Step 4: Próbák, ellenőrzés, commit.**
  - **Próbák:**
    - `provider: "github"`;
    - a `skipBrowserRedirect` törlése;
    - `redirectTo: authCallback(origin, "/")`;
    - `error || !data.url` → `error`;
    - a `"google"` hibakód helyett `"1"`.
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git add app/auth/google/route.ts app/auth/google/route.test.ts
git commit -m "feat: start a google sign-in through supabase" -- app/auth/google/route.ts app/auth/google/route.test.ts
```

### Task 3: A callback a Google elutasítását is megérti

**Files:** Modify `app/auth/callback/route.ts`. Create `app/auth/callback/route.test.ts`.

- [ ] **Step 1: Teszt (RED).** `app/auth/callback/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";

const { GET } = await import("./route.ts");
const back = async (query: string) => (await GET(authRequest(`/auth/callback${query}`))).headers.get("location");

// Google sign-in spec, and Review Focus 2 and 3. Kills an uninvited account shown "link expired", a cancel
// shown "not invited", a refusal that still tries a session (an `error` with a stray `code` included),
// and an unsafe `next` kept on the error path.
test("the callback maps Google's refusals to not_invited or google, keeps a safe next, and opens no session", async () => {
  const calls = fakeAuth();
  assert.equal(await back("?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance&next=%2Flibrary"), "http://localhost/login?error=not_invited&next=%2Flibrary");
  assert.equal(await back("?error=access_denied&next=%2Flibrary"), "http://localhost/login?error=google&next=%2Flibrary");
  assert.equal(await back("?error=server_error&code=abc&next=%2F%2Fevil.test"), "http://localhost/login?error=google&next=%2F");
  assert.deepEqual(calls, []);
});

// The two ways in that work today, now with `next` kept on failure. Kills the code and the token hash
// swapped or dropped, success not going to the safe next, and a failure that loses next.
test("the callback signs in with a code or a token hash and goes to the safe next; a failure goes to error=1", async () => {
  let calls = fakeAuth();
  assert.equal(await back("?code=abc&next=%2Flibrary"), "http://localhost/library");
  assert.deepEqual(calls, [["exchangeCodeForSession", "abc"]]);
  calls = fakeAuth();
  assert.equal(await back("?token_hash=th&type=email&next=%2F%2Fevil.test"), "http://localhost/");
  assert.deepEqual(calls, [["verifyOtp", { token_hash: "th", type: "email" }]]);
  fakeAuth({ exchangeCodeForSession: { error: { message: "invalid flow state" } } });
  assert.equal(await back("?code=abc&next=%2Flibrary"), "http://localhost/login?error=1&next=%2Flibrary");
  calls = fakeAuth();
  assert.equal(await back(""), "http://localhost/login?error=1&next=%2F");
  assert.deepEqual(calls, []);
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test app/auth/callback/route.test.ts`. Várt: az első teszt piros (ma `/login?error=1`, és megpróbál munkamenetet nyitni); a második részben piros (a hibaágon nincs `next`).

- [ ] **Step 2: A route (GREEN).** Az `app/auth/callback/route.ts` törzse:

```ts
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { loginWithError } from "@/lib/pipeline/util";
import { createClient, safeNext } from "@/lib/supabase/server";

// Handles the token_hash links from the customized email templates (works across devices), the default
// PKCE ?code= links, and Google's sign-in (auth/google), which comes back with a ?code= too, or with an
// error when Google or Supabase refused it.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;
  const next = safeNext(params.get("next"));
  // Refused: sign-ups are off, so an uninvited Google account gets signup_disabled; anything else (the
  // reader cancelled at Google) is a plain Google failure. No session is tried, even with a stray code.
  if (params.get("error")) {
    const reason = params.get("error_code") === "signup_disabled" ? "not_invited" : "google";
    return NextResponse.redirect(loginWithError(origin, reason, next));
  }
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const supabase = await createClient();

  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };

  return NextResponse.redirect(error ? loginWithError(origin, "1", next) : new URL(next, origin));
}
```

- [ ] **Step 3: Futtatás.** Várt: zöld.

- [ ] **Step 4: Próbák, ellenőrzés, commit.**
  - **Próbák:**
    - a `signup_disabled` ág → mindig `"google"`;
    - az `if (params.get("error"))` blokk a `createClient` és a csere utánra kerül;
    - a hibaágon `next` helyett `"/"`;
    - `verifyOtp` és `exchangeCodeForSession` felcserélve.
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git add app/auth/callback/route.test.ts
git commit -m "feat: tell an uninvited google account from a failed sign-in, and keep next on failure" -- app/auth/callback/route.ts app/auth/callback/route.test.ts
```

### Task 4: A belépő oldal és a doksi

**Files:** Modify `app/login/page.tsx`. Create `app/login/page.test.ts`. Docs: `CLAUDE.md` → Auth, `SECURITY.md` → Auth and the invite gate, `README.md` → Supabase, `DESIGN.md` → Colors.

- [ ] **Step 1: Teszt (RED).** `app/login/page.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../../lib/test/render.ts";

// render.ts's loader also resolves @/lib/supabase/server (the page's safeNext) to the route stub.
const { default: LoginPage } = await import("./page.tsx");
const page = async (query: Record<string, string>) => render(await LoginPage({ searchParams: Promise.resolve(query) }));

// Google sign-in spec. Kills the Google form dropped or put after the email form, either form losing the
// safe next, and the button's text changed.
test("the login page offers Google first, then the email link, both carrying the safe next", async () => {
  const doc = await page({ next: "/library?x=1" });
  const forms = [...doc.querySelectorAll("form")].map((form) => [form.getAttribute("action"), form.querySelector('input[name="next"]')?.getAttribute("value")]);
  assert.deepEqual(forms, [["/auth/google", "/library?x=1"], ["/auth/login", "/library?x=1"]]);
  assert.match(doc.querySelector('form[action="/auth/google"] button')?.textContent ?? "", /Belépés Google-lel \/ Continue with Google/);
  const evil = await page({ next: "//evil.test" });
  assert.deepEqual([...evil.querySelectorAll('input[name="next"]')].map((input) => input.getAttribute("value")), ["/", "/"]);
});

// Review Focus 4. Kills a reason shown with the wrong text, an unknown reason shown as nothing, and an
// alert region that only mounts with an error.
test("the login page says why a sign-in failed, in both languages, in its alert region", async () => {
  const expired = "A link lejárt vagy érvénytelen. / The link expired or is invalid.";
  const cases: [string, string][] = [
    ["not_invited", "Ez a Google-fiók nincs meghívva. / This Google account isn't invited."],
    ["google", "A Google-belépés nem sikerült, próbáld újra. / Google sign-in failed, try again."],
    ["1", expired],
    ["valami", expired],
  ];
  for (const [error, text] of cases) assert.equal((await page({ error })).querySelector('[role="alert"]')?.textContent, text, error);
  assert.equal((await page({})).querySelector('[role="alert"]')?.textContent, "");
});

// Kills the sent state that still shows a form (a second link, or a Google sign-in mid-wait).
test("after a link is sent, the page shows only that note", async () => {
  const doc = await page({ sent: "1" });
  assert.equal(doc.querySelectorAll("form").length, 0);
  assert.match(doc.body.textContent ?? "", /a belépő link úton van/);
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test app/login/page.test.ts`. Várt: az első két teszt piros, a harmadik zöld.

- [ ] **Step 2: Az oldal (GREEN).** Az `app/login/page.tsx` egésze:

```tsx
import { ErrorLine } from "@/app/components/error-line";
import { StatusCard } from "@/app/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/supabase/server";

// Before sign-in there is no language yet, so every line shows both, "magyar / English".
const copy = {
  sent: { hu: "Ha ez a cím meghívott, a belépő link úton van — nézd meg a leveleidet.", en: "If this address is invited, a sign-in link is on its way." },
  google: { hu: "Belépés Google-lel", en: "Continue with Google" },
  or: { hu: "vagy", en: "or" },
  send: { hu: "Belépő link küldése", en: "Send link" },
  errors: {
    "1": { hu: "A link lejárt vagy érvénytelen.", en: "The link expired or is invalid." },
    google: { hu: "A Google-belépés nem sikerült, próbáld újra.", en: "Google sign-in failed, try again." },
    not_invited: { hu: "Ez a Google-fiók nincs meghívva.", en: "This Google account isn't invited." },
  },
};

const both = ({ hu, en }: { hu: string; en: string }) => `${hu} / ${en}`;

/** Google's "G", unchanged as its brand rules ask: the one place its four colours appear (DESIGN.md → Colors). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-4">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  const { next, sent, error } = await searchParams;
  const target = safeNext(next);
  // An unknown reason is still a failed sign-in: the link message, as before Google.
  const failure = error ? (copy.errors[error as keyof typeof copy.errors] ?? copy.errors["1"]) : null;

  return (
    <StatusCard brand eyebrow="INVITE-ONLY / CSAK MEGHÍVÓVAL" title="SIGN IN">
      {sent ? (
        <p className="mt-7 border-l-4 border-signal pl-4 text-sm leading-6">
          {copy.sent.hu}
          <br />
          <span className="text-ink/60">{copy.sent.en}</span>
        </p>
      ) : (
        <>
          <ErrorLine className="mt-7">{failure && both(failure)}</ErrorLine>
          <form action="/auth/google" method="post" className="mt-7">
            <input type="hidden" name="next" value={target} />
            <Button type="submit" variant="brutal" className="min-h-10 w-full">
              <GoogleMark /> {both(copy.google)}
            </Button>
          </form>
          <p className="my-5 flex items-center gap-3 font-mono text-[11px] text-ink/60 before:h-px before:flex-1 before:bg-ink/20 after:h-px after:flex-1 after:bg-ink/20">
            {both(copy.or)}
          </p>
          <form action="/auth/login" method="post" className="space-y-4">
            <input type="hidden" name="next" value={target} />
            <div className="space-y-2">
              <Label htmlFor="email" className="font-mono text-xs">EMAIL</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="min-h-10 border-2 border-ink bg-paper focus-visible:border-signal"
              />
            </div>
            <Button type="submit" variant="ink" className="min-h-10 w-full">
              {both(copy.send)}
            </Button>
          </form>
        </>
      )}
    </StatusCard>
  );
}
```

  Futtatás: a Step 1 parancsa. Várt: zöld. Ha a `sent` szöveg mintája nem talál (a `—` vagy a sortörés miatt), a teszt mintája igazodik a szöveghez, nem fordítva.

- [ ] **Step 3: Doksi.**
  - **CLAUDE.md → Auth:**
    - az első bekezdés végére: „Members can also sign in with Google: `POST /auth/google` starts Supabase's PKCE sign-in (`signInWithOAuth`, `skipBrowserRedirect`) back to `/auth/callback` (`authCallback`); with sign-ups off, Supabase refuses an uninvited Google account (`error_code=signup_disabled`) and creates nothing, and the callback sends it to `/login?error=not_invited`; any other refusal to `error=google`, and a failed link to `error=1`, each keeping `next` (`loginWithError`). Supabase links a member's Google identity to their invited user when the verified emails match exactly.”
    - a `/login` leírásába: „the page offers Google first, then the email link”.
  - **SECURITY.md → Auth and the invite gate:** egy új bekezdés:
    - Google-belépés: a regisztráció tiltása a kapu;
    - a Google csak a `@gmail.com` és a Workspace-címekért kezeskedik, más címen az `email_verified` elavult lehet, és a Supabase mégis összeköt, ezért tagot csak Gmail- vagy Workspace-címen hívunk meg;
    - a rendszer-fiók `+radar` aliasa nem érhető el Google-lel;
    - egy tag eltávolítása a felhasználó törlése vagy tiltása.
  - **README.md → Supabase:**
    - a „On your own project” lista végére egy pont: *Google sign-in*, a Google Auth Platform kliense a Supabase visszatérési címével, majd a *Sign In / Providers → Google* bekapcsolása, a sign-ups kikapcsolva; a részletes lépések a TODO.md-ben;
    - a „To sign in locally” bekezdés végére: „With Google, the shared project must list `http://localhost:3000/**` in its Redirect URLs (the owner sets it).”
  - **DESIGN.md → Colors:** a „Three colour literals live outside `:root`” mondat „Four” lesz, és a felsorolás végére: „and the four colours of Google's „G” on the login page's Google button (`app/login/page.tsx`), which its brand rules ask to keep unchanged.”

- [ ] **Step 4: Próbák, ellenőrzés, commit.**
  - **Próbák:**
    - a Google-űrlap a második helyre kerül;
    - a Google-űrlap rejtett `next`-je törölve;
    - a `?? copy.errors["1"]` törölve;
    - az `ErrorLine` csak hibánál felcsatolva (`{failure && <ErrorLine>…}`).
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git add app/login/page.test.ts
git commit -m "feat: offer google sign-in on the login page beside the email link" -- app/login/page.tsx app/login/page.test.ts CLAUDE.md SECURITY.md README.md DESIGN.md
```

### Task 5: Playwright-végigjátszás a belépésen

**Files:** nincs; az eredmények a ledgerbe kerülnek. A szkript a `.playwright-mcp/` mappába (git- és lint-ignorált), a végén törlődik.

- [ ] **Step 1: Dev server** (a `.next/cache/turbopack` törlése után, TESTING.md → Pitfalls), majd várj a `Ready`-re.
- [ ] **Step 2: A próba.** `.playwright-mcp/login-walk.js`, futtatás a `browser_run_code_unsafe` `filename`-jével:

```js
async (page) => {
  const out = {};
  const supabase = [];
  // Nothing may reach a real service: every request to Supabase is recorded and aborted.
  await page.route(/supabase\.co/, (route) => { supabase.push(route.request().url()); return route.abort(); });
  for (const [width, height] of [[360, 740], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://localhost:3000/login?next=%2Flibrary%3Fx%3D1");
    out[`layout@${width}`] = await page.evaluate(() => ({
      noHScroll: document.documentElement.scrollWidth <= innerWidth,
      forms: [...document.querySelectorAll("form")].map((f) => f.getAttribute("action")),
      googleHeight: Math.round(document.querySelector('form[action="/auth/google"] button').getBoundingClientRect().height),
    }));
  }
  // Keyboard: Google comes first.
  await page.keyboard.press("Tab");
  out.firstTab = await page.evaluate(() => document.activeElement?.textContent?.trim());
  // Review Focus 5: the browser leaves for Supabase's authorize URL, PKCE on, back to our callback.
  await page.getByRole("button", { name: /Continue with Google/ }).click();
  await page.waitForTimeout(500);
  const authorize = new URL(supabase[0]);
  out.authorize = {
    path: authorize.pathname,
    provider: authorize.searchParams.get("provider"),
    redirectTo: authorize.searchParams.get("redirect_to"),
    challenge: Boolean(authorize.searchParams.get("code_challenge")),
    method: authorize.searchParams.get("code_challenge_method"),
  };
  out.verifierCookie = (await page.context().cookies()).some((c) => c.name.endsWith("-code-verifier"));
  // The callback's refusals, as Supabase sends them.
  const landing = async (query) => {
    await page.goto(`http://localhost:3000/auth/callback${query}`);
    return { url: page.url().replace("http://localhost:3000", ""), alert: await page.locator('[role="alert"]').first().textContent(), next: await page.locator('form[action="/auth/google"] input[name="next"]').getAttribute("value") };
  };
  out.uninvited = await landing("?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance&next=%2Flibrary");
  out.cancelled = await landing("?error=access_denied&next=%2Flibrary");
  out.empty = await landing("");
  out.supabaseRequests = supabase.length;
  return out;
}
```

- [ ] **Step 3: Az elvárt eredmény.**
  - Mindkét méreten nincs vízszintes görgetés, a sorrend `["/auth/google", "/auth/login"]`, és a gomb legalább 40 px magas.
  - Az első Tab a Google-gombra esik.
  - **Az `authorize` objektum:**
    - `path` = `/auth/v1/authorize`;
    - `provider` = `google`;
    - `redirectTo` = `http://localhost:3000/auth/callback?next=%2Flibrary%3Fx%3D1`;
    - `challenge: true`;
    - `method` = `s256` vagy `S256`;
    - `verifierCookie: true`.
  - **A három visszatérés:**
    - `uninvited` → `/login?error=not_invited&next=%2Flibrary`, a riasztás a „nincs meghívva” szöveg, a rejtett `next` `/library`;
    - `cancelled` → `error=google`;
    - `empty` → `error=1`, és a `next` itt `/`.
  - `supabaseRequests` = 1, és az is megszakítva.
  - Az eredmény a ledgerbe kerül, a szkript törlődik. Eltérésnél a systematic-debugging jön, és a javítás saját `fix:` commitba megy, egy elbukó teszttel.

### Task 6: Teljes végigjátszás a push előtt

A helyi `main` a push előtt az R1-et, a Hírek csomagot, az „Olvasd itt”-et, az R2-t és ezt a munkát hordozza. Ez a feladat az egész appot végigjátssza az előnézeten, élő adat nélkül.

**Files:** nincs; az eredmények a ledgerbe, a hibák a saját `fix:` commitjukba kerülnek (elbukó teszttel, ahol a hiba logika). Szkriptek a `.playwright-mcp/`-ben, a végén törlődnek.

- [ ] **Step 1: Minden nézet minden méreten.**
  - **Hol:** 360×740, 768×1024, 1280×800 és 1920×1080 px-en, ezeken a nézeteken: `radar`, `radar-empty`, `companies`, `library`, `library-empty`, `archive`, `archive-empty`, a négy `*-loading`, és a `/dev/preview/post`.
  - **Elvárt:** nincs vízszintes görgetés, és a konzolon nincs hiba.

```js
async (page) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const views = ["radar", "radar-empty", "companies", "library", "library-empty", "archive", "archive-empty", "radar-loading", "library-loading", "archive-loading", "post-loading"];
  const bad = [];
  for (const [width, height] of [[360, 740], [768, 1024], [1280, 800], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const path of [...views.map((v) => `/dev/preview?view=${v}`), "/dev/preview/post"]) {
      await page.goto(`http://localhost:3000${path}`);
      await page.waitForLoadState("networkidle");
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) bad.push(`${path}@${width}`);
    }
  }
  return { bad, errors };
}
```

- [ ] **Step 2: A Radar folyamatai** 1280 px-en (`view=radar`, majd `&fail=1&slow=1`), mindegyik egy-egy `browser_run_code_unsafe` hívás. Elvárt viselkedés:

| Folyamat | Lépés | Elvárt |
| --- | --- | --- |
| Kategória | a „Kutatási radar” chip | `aria-pressed="true"`, a kártyák mind kutatásiak |
| Olvasott | egy kártya „Olvasott” gombja | `aria-pressed="true"`, a kártya halvány; `z` → visszaáll |
| Megnyitás | a „Megnyitás” link (új lap nélkül: `page.route` a cél hosztra, abort) | „Olvasottnak jelölve” toast, Visszavonás → a kártya újra olvasatlan |
| Teendő | „Teendőhöz adás” | toast „Hozzáadva a teendőkhöz”; a panelen (`Haladás és to-do`) ott a sor; törlés → toast, Visszavonás → vissza |
| Olvasd itt, poszttal | a fixture `local-2026-W39-read` kártyája | `<a href="/library/-1">` |
| Olvasd itt, poszt nélkül | egy másik kártya „Olvasd itt” gombja (`slow=1`) | a chat kinyílik, „KÜLDÉS…”, majd a bejegyzés „FELDOLGOZÁS…”-sal |
| Chat hiba | `fail=1&slow=1`, egy link + Enter | a mező üres, majd újra a link; „Nem ment át, próbáld újra.” egyszer, ismételve sem halmozódik |
| Panelek | a panel nyitva, majd a taiyaki | (R3 előtt) feljegyezni, mi történik; nem hiba |
| Billentyűk | `j`, `j`, `k`, `r`, `l`, `?` | a fókusz kártyáról kártyára lép; `r`/`l` vált; `?` megnyitja a súgót |
| Nyelv | „Switch to English” | a felirat „Read here”, frissítés nélkül |
| Oldalsáv | `[` | az oldalsáv 56 px-es sínné csukódik, `aria-expanded="false"` |
| Kereső | `/` | a „Hamarosan” dialógus 160 ms körül nyílik |

- [ ] **Step 3: Mobil (360×740).**
  - Az alsó sáv öt helye látszik.
  - A „Több” sheet nyílik: AI cégek, Archívum, a nyelv, a kijelentkezés.
  - A taiyaki nyitja a chatet.
  - A teendő-panel alulról nyílik.
  - A toast nem takarja a sávot.
  - Érintés-emulációval (`hasTouch`) minden gomb legalább 40 px.
- [ ] **Step 4: Library és poszt.**
  - `view=library`: egy rossz link → magyar hibasor; `fail=1` mellett egy jó link → „Nem sikerült beküldeni…”.
  - `/dev/preview/post`: minden blokktípus renderel, a Fordítás és a Szerkesztés nincs (az előnézetben `canEdit` hamis), a konzol tiszta.
- [ ] **Step 5: Csökkentett mozgás.** `reducedMotion: "reduce"` mellett a lenyomás nem mozdít, és a toast eltűnik.
- [ ] **Step 6: Összegzés.**
  - Egy táblázat a ledgerbe: folyamat, elvárt, kapott, és hogy rendben van-e.
  - Minden eltérés vagy egy `fix:` commit (elbukó teszttel, ha logikai), vagy egy ledgerbe írt ruling, ha szándékos.
  - A szkriptek törlődnek a `.playwright-mcp/`-ből.
  - Az öt ellenőrzés zöld.

### A záró review

Egy friss reviewer a legerősebb modellen nézi végig a branchet (`git diff main...google-sso`), a spec és ez a terv mellett. Külön figyel a Review Focus öt sorára, a PKCE-folyamatra (a verifier süti és a `skipBrowserRedirect`), a `next` útjára, a meghívásos kapura (semmi nem hozhat létre felhasználót), és a SECURITY.md új bekezdésére. A javítások egy körben jönnek, mindegyik egy előbb elbukó teszttel.
