# Testing

There is no test framework. Tests use `node:test` and `node:assert/strict`, and TypeScript runs through Node's type stripping. No test touches the network or Supabase.

## Test layers

1. **Unit tests on `lib/`.** Pure functions and whole pipeline runs (`processSource`, `runDaily`, `translatePost`, `generate()`) run under `node --test`, against the `fakeDb` stand-in and a mocked `fetch`.
2. **The static render harness** (`lib/test/render.ts`). A component test renders a React element to static HTML with `renderToStaticMarkup` and queries the result as a linkedom `Document`. Hooks run once, and there are no effects, no events and no hydration, so clicks and state changes are invisible here. What it does catch: markup and ARIA contracts, crashes, and a render-phase loop ("Too many re-renders"). `app/components/shell.test.ts` smoke-renders every app-shell client component on the preview fixtures for exactly that. The harness is verified on Node 24.16 only; Node 22.13 is unverified.
3. **The route-handler layer** (`lib/test/route-hooks.ts`, plus the `STUBS` map in `lib/test/tsx-hooks.ts`). A route handler runs as a plain function, with no Next.js server, against a stubbed session, admin client and `after()`.
4. **The runtime smoke check on `/dev/preview`,** for UI work:
   - Run `npm run dev`.
   - Every preview view (AGENTS.md → Commands), including with `&fail=1`, and `/dev/preview/post` must answer 200.
   - No response may contain "Too many re-renders", "Unhandled Runtime Error" or "Application error".
   - Then check the change in a browser with Playwright at 360, 768 and 1280px: the interaction itself, the console, and no horizontal scroll.
   - Add a fixture to `lib/fixtures.ts` with every new block type, banner or empty state. `lib/fixtures.test.ts` fails for a missing block type.
5. **The manual checklist against a deployment.** README.md → Testing lists what a person checks by hand in a browser (with Playwright) after a deploy. The live checks that are still pending are in TODO.md ("Halasztott élő próbák", "Élő próbák a UI/UX A deploy után").
6. **Mutation probes as proof.** A test that pins a security rule or a subtle behaviour is proven by breaking the code on purpose:
   - Apply a named mutation temporarily.
   - Run the named test file and see it FAIL.
   - Revert, and check that `git diff --stat` shows only your intended change.

   The test's comment names the mutation it kills, as in `// X1: with CRON_SECRET unset, no header can be right…` in `app/api/cron/daily/route.test.ts`.
7. **CI** (`.github/workflows/ci.yml`) runs the five checks from AGENTS.md → Commands, in the same order, on every push and pull request:
   - Node 24.16.0 on `ubuntu-24.04`, with a 20-minute timeout;
   - `corepack pnpm@11.25.0 install --frozen-lockfile`, with no package-manager cache;
   - a superseded run on the same ref is cancelled (`concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`).

   The workflow's permissions and pinning are in SECURITY.md → Supply chain. Branch protection on `main`, which requires the `checks` job, is the owner's setting (TODO.md).

## How to run

```bash
npm test   # node --experimental-strip-types --no-warnings --test "lib/**/*.test.ts" "app/**/*.test.ts"
node --experimental-strip-types --no-warnings --test lib/blocks.test.ts                          # one file
node --experimental-strip-types --no-warnings --test "app/(app)/library/[[]id]/post-editor.test.ts"
node --experimental-strip-types --no-warnings --test "app/media/[[]...path]/route.test.ts"
```

`node --test` reads each `[` in a path as the start of a glob character class, so every bracketed segment needs escaping, not only `[id]`: `[id]` becomes `[[]id]`, and `[...path]` becomes `[[]...path]`. The parentheses in `(app)` are literal. A path that matches nothing runs 0 tests and still exits 0, so the `ℹ tests` line of any run must never read 0.

## Where tests live

- Next to their module, as `x.test.ts`, under `lib/` and `app/`. `npm test`'s two globs find only those.
- Route tests are `route.test.ts` beside their `route.ts` (`app/api/**`, `app/media/[...path]/`).
- Component tests sit beside the component (`app/components/post-blocks.test.ts`, `app/(app)/library/[id]/*.test.ts`), and `app/components/shell.test.ts` holds the shell's smoke renders.
- The helpers are not `*.test.ts` files, so they never run as suites of their own: `lib/pipeline/fake-db.ts`, `lib/pipeline/mock-fetch.ts` and `lib/test/*`.

## Helpers

### `fakeDb(route?, tables?)`, `lib/pipeline/fake-db.ts`

`fakeDb` is an offline Supabase client for tests that exercise real pipeline wiring.

- **`model_settings`** answers with `route` and records each task asked for (`.tasks`).
- **`sources`** (one `source`, or several `sources`), `posts`, storage and the RPCs answer from `tables`. Any other table only upserts, recorded on `.upserts`, and answers `select().gte()` from `tables.rows`.
- **Filters.** Select filters (`eq`, `neq`, `lt`) are applied to the fixture rows, as PostgREST would. A column the fixture never set passes every filter, so a test of which row the code reads needs a fixture whose `id` and `source_id` differ. A null filter value, or a null row value, never passes, as in SQL: only the `posts` update chain's `.is(...)` matches null.
- **Errors.** A `sources` `single()` that matches no row, or several, answers PGRST116. `pgError(code, message)` builds any other PostgREST-shaped error.
- **The error knobs:**
  - `postError` makes every `posts` lookup fail, or only the Nth with `postErrorOnCall`;
  - `postUpsertError` and `postUpdateError` fail the `posts` writes;
  - `sourceInsertError` takes a `pgError`, such as `"23505"`;
  - `rpcError` takes a `pgError`, such as `"42501"`;
  - `storageError: true` makes every `list`, `upload` and `remove` reject.
- **Recording.** Every write is recorded: `sourceUpdates`, `sourceInserts`, `postUpserts`, `postUpsertOptions`, `postUpdates`, `postUpdateFilters`, `eqCalls`, `rpcCalls`, `upserts`, `removedMedia`, and `writes`, the cross-table order.
- **Storage** keeps its own object set, seeded from `tables.media`. It answers `list`, `upload`, `remove` and `download`, and throws for any bucket other than `MEDIA_BUCKET`.
- **Not written through.** A `sources` `insert` is recorded but not written through, so a later select still sees only the fixture.

### Fetch, DNS and the environment, `lib/pipeline/mock-fetch.ts`

Each of these restores itself when the test ends.

- **`mockFetch(t, handler)`** replaces `globalThis.fetch` for test `t`. The handler gets `(url, init)`, so it can route by URL or inspect the request.
- **`withEnv(t, name, value)`** sets or unsets one variable. `withGeminiKey(t)` sets `GEMINI_API_KEY`, so `generate()` takes its Gemini route.
- **`mockDns(t, ...addresses)`** fakes the DNS check in `safeFetch` for a fixed real hostname (default `TEST_IP`), returning several addresses in one answer. `TEST_IP` / `TEST_HOST` is a public IP literal that `safeFetch` resolves offline, so a test that uses it as the host needs no `mockDns` at all.
- **`endlessBody()`** is a body that never ends, with `reads()` and `cancelled()`. It proves that a body was released unread, not read up to a cap and then dropped.
- **Model answers:**
  - `geminiResponse(out)` is a real-shaped Gemini answer, and `geminiText(text)` is a raw one for malformed-output cases.
  - `geminiPrompt(init)` gives the prompt a call sent. `geminiSchemaKeys(init)` gives the schema it asked for; route a fake by the schema, not by the prompt's wording.
  - `youtubeUrl` and `oembedThenBrokenGemini` are shared YouTube fixtures.

### Components, `lib/test/render.ts`

Importing `render.ts` registers `tsx-hooks.ts` with `module.register`. The hooks do three things:

- they resolve `@/` and extensionless relative imports (`./x` → `.ts`, `.tsx` or `index`) from a `.ts` or `.tsx` parent;
- they compile `.tsx` with the project's own TypeScript (`transpileModule`);
- they swap `next/link` and `next/navigation` for `next-stub.ts`.

`render(element)` returns a linkedom `Document`. Import `render.ts` first, then the component with `await import("./x.tsx")`.

### Route handlers, `lib/test/route-hooks.ts`

Importing it registers `tsx-hooks.ts`, whose `STUBS` map resolves `@/lib/supabase/server` and `next/server` to `route-hooks.ts`, and `server-only` to an empty module. It stands in for both:

- `getReader`, `getViewer` and `createClient` answer `routeStub.reader`, which you set with `signedIn(db, id?)`;
- `createAdminClient` answers `routeStub.admin` and counts `adminCalls`;
- `after(task)` queues the task on `routeStub.scheduled`, and `scheduledSourceIds(admin)` runs the queue;
- `NextResponse` is the real one.

Call `resetRoute()` first in every test, and import this file by its relative path, because a second path would load a second instance. Then import the route with `await import("./route.ts")`.

No test loads `lib/supabase/server.ts` or `lib/language.ts`: the route tests get `route-hooks.ts` in the first one's place. `lib/content.ts` is loaded by the state route's test, with `server-only` mapped to the empty module.

### Fixtures

- **`lib/test/fixtures.ts`** has `testPost(overrides)`: a minimal `Post` with no blocks, submitted by `"owner"`. Unit and component tests override just the fields they are about.
- **`lib/fixtures.ts`** is the offline preview's data, built on `testPost`. `shell.test.ts` renders the shell on it. `lib/fixtures.test.ts` guards it: every block type, all four banners, exactly three must-reads, unique ids, and negative post ids.

## Conventions

- **Pin behaviour, not class names.** Assert what a user or a caller can observe: text, attributes, ARIA state, a write's payload, a status code. CSS and geometry (a lift, a lane, no horizontal scroll at 360px) are checked with Playwright, never with a class-name test.
- **Table-driven cases name their input,** in the test title (`` `…for x on ${name}` ``) or in the assertion message (`JSON.stringify(body)`), so a failure says which row broke.
- **Every route test file keeps one authenticated case that reaches the handler,** so a 401 case can't pass vacuously. For the cron, whose auth is a bearer secret rather than a signed-in reader, that is a case with the right `Authorization` header, not `signedIn(...)`.
- **A security test is proven with a named mutation** (layer 6).
- **No test may pass vacuously.** A run that reports 0 tests, an assertion inside a loop over an empty list, and an `assert.rejects` that doesn't check which error was thrown all prove nothing. Assert the count, or the specific error.

## Pitfalls

- **`mockDns` twice in one test body** corrupts the restore: `t.mock.method` restores to the first mock, not to the real `dns.lookup`. Nest `t.test()` subtests instead, with one mock each.
- **A linkedom node inside `assert`.** On failure, Node formats the whole document, which takes about 25s and then throws `RangeError: Array buffer allocation failed`. Compare an attribute, `textContent` or a count instead.
- **An unescaped `[` in a test path** runs 0 tests and exits 0 (How to run).
- **Import order.** Import `render.ts` or `route-hooks.ts` before the module under test, and load that module with a dynamic `import()`. Otherwise the loader hooks aren't registered yet.

## What isn't automated, and why

- **RLS, grants and the SQL functions.** This covers `update_post_overrides`' 42501 and `refresh_must_read`'s three. CI has no database, and these are the only real authorization layer. The options (a Postgres service container with an auth shim, `@electric-sql/pglite`, or the Supabase CLI stack) are in TODO.md under "DB-tesztek a CI-ban", not approved.
- **End-to-end in CI.** Playwright runs by hand. Running it in CI would need a new devDependency, a Chromium download, `next dev` in CI (the preview only exists in development) and tolerance for flaky tests. That option is in TODO.md under "Playwright e2e a CI-ban", not approved.
- **`proxy.ts` and the auth routes.** They need a stand-in for `@supabase/ssr`'s `createServerClient` in the route layer (TODO.md).
- **Live models and live websites.** These are checked by hand against a deployment with a signed-in session (layer 5).
