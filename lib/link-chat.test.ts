import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  createLinkChat,
  httpTransport,
  MAX_POLLS,
  memoryTransport,
  parseLinkMessage,
  POLL_MS,
  toThread,
  type Answer,
  type ChatNotice,
  type ChatTransport,
} from "./link-chat.ts";
import type { MySource } from "./my-sources.ts";
import { mockFetch } from "./pipeline/mock-fetch.ts";

const linkOf = (text: string) => {
  const message = parseLinkMessage(text);
  return "url" in message ? message.url : null;
};
const noteOf = (text: string) => {
  const message = parseLinkMessage(text);
  return "note" in message ? message.note : undefined;
};

// Kills a message with no link sent as one ("https://" alone, or a link glued to a word, is none).
test("parseLinkMessage finds no link in plain text, a bare scheme, or a link glued to a word", () => {
  for (const text of ["szia, mi újság?", "   ", "https://", "Nézd:https://example.test/a"]) {
    assert.deepEqual(parseLinkMessage(text), { error: "no_link" }, text);
  }
});

// Kills the note keeping the link, and a note that isn't the rest of the message.
test("parseLinkMessage takes the link and keeps the rest of the message as its note", () => {
  assert.deepEqual(parseLinkMessage("https://example.test/a nézd meg a második részt"), {
    url: "https://example.test/a",
    note: "nézd meg a második részt",
    moreLinks: false,
  });
});

// Review Focus 4. Kills the CLOSING strip (the full stop ends up in the URL, a 404), the OPENING strip
// (a link in parentheses is not found), the balanced-bracket rule (Wikipedia's links break), the `<…>`
// autolink's `>`, the Hungarian quotes, the ellipsis, and IPv6's bracket.
test("parseLinkMessage strips sentence punctuation around the link, but keeps a bracket the link itself opened", () => {
  assert.equal(linkOf("Ezt olvasd: https://example.test/a."), "https://example.test/a");
  assert.equal(linkOf("Szerinted jó? https://example.test/a?!"), "https://example.test/a");
  assert.equal(linkOf('"https://example.test/a",'), "https://example.test/a");
  assert.equal(linkOf("(https://example.test/a) fontos"), "https://example.test/a");
  assert.equal(linkOf("https://en.wikipedia.org/wiki/Taiyaki_(food)."), "https://en.wikipedia.org/wiki/Taiyaki_(food)");
  assert.equal(linkOf("(lásd https://en.wikipedia.org/wiki/Taiyaki_(food))"), "https://en.wikipedia.org/wiki/Taiyaki_(food)");
  assert.equal(linkOf("<https://example.test/a>"), "https://example.test/a");
  assert.equal(linkOf("„https://example.test/a” – ezt nézd"), "https://example.test/a");
  assert.equal(linkOf("“https://example.test/a”"), "https://example.test/a");
  assert.equal(linkOf("Nézd meg: https://example.test/a…"), "https://example.test/a");
  assert.equal(linkOf("http://[::1]"), "http://[::1]");
  assert.equal(linkOf("[http://[::1]]"), "http://[::1]");
});

// Review Focus 4. Kills `moreLinks` always false (the reader never learns the second link was left
// out), and the second link dropped from the note.
test("parseLinkMessage sends the first of several links and says there were more", () => {
  assert.deepEqual(parseLinkMessage("https://a.test/1 és https://b.test/2"), {
    url: "https://a.test/1",
    note: "és https://b.test/2",
    moreLinks: true,
  });
});

// Kills `note || null` (an empty string is stored as a note), and a note whose whitespace isn't collapsed.
test("parseLinkMessage collapses the note's whitespace, and a blank one is null", () => {
  assert.equal(noteOf("  https://example.test/a  \n\t "), null);
  assert.equal(noteOf("sok   szóköz\n\nés sor https://example.test/a"), "sok szóköz és sor");
});

// Kills the `i` flag: a pasted "HTTPS://" link is still a link. The route's parseSubmittedUrl lowercases it.
test("parseLinkMessage takes an upper-case scheme as a link, as typed", () => {
  assert.deepEqual(parseLinkMessage("HTTPS://EXAMPLE.TEST/A"), { url: "HTTPS://EXAMPLE.TEST/A", note: null, moreLinks: false });
});

const source = (id: number, status: MySource["status"], overrides: Partial<MySource> = {}): MySource => ({
  id,
  url: `https://blog.test/${id}`,
  kind: "article",
  status,
  error: null,
  note: null,
  createdAt: "2026-09-24T08:00:00Z",
  post: null,
  ...overrides,
});

/** Lets every settled promise run its callbacks (setImmediate isn't one of the mocked timers). */
const flush = () => new Promise((resolve) => setImmediate(resolve));
const answer = (status: number, body: Record<string, unknown> = {}) => async (): Promise<Answer> => ({ status, body });
const offline = async (): Promise<Answer> => {
  throw new TypeError("Failed to fetch");
};

/** GET /api/sources/mine answers `sources` and the writes answer 202, unless `answers` says otherwise; every call is counted. */
function fakeTransport(sources: MySource[], answers: { [K in keyof ChatTransport]?: () => Promise<Answer> } = {}) {
  const calls = { mine: 0, submit: [] as [string, string | null][], retry: [] as number[] };
  const transport: ChatTransport = {
    mine: () => {
      calls.mine++;
      return answers.mine?.() ?? answer(200, { sources })();
    },
    submit: (url, note) => {
      calls.submit.push([url, note]);
      return answers.submit?.() ?? answer(202, { ok: true, id: 1 })();
    },
    retry: (sourceId) => {
      calls.retry.push(sourceId);
      return answers.retry?.() ?? answer(202, { ok: true })();
    },
  };
  return { transport, calls };
}

/** Moves the mocked clock on by `ms`, and lets the load it starts land. */
async function wait(t: TestContext, ms: number) {
  t.mock.timers.tick(ms);
  await flush();
}

/** An open chat whose thread holds `sources` (one pending by default), its first load landed.
 *  Registers its own teardown: a failing assertion must not leave a polling chat behind to keep
 *  the process alive once the test ends and its mocked timers give way to real ones. */
async function opened(t: TestContext, sources = [source(1, "pending")], isVisible = () => true) {
  const { transport, calls } = fakeTransport(sources);
  const chat = createLinkChat(transport, isVisible);
  t.after(() => chat.close());
  chat.open();
  await flush();
  return { chat, calls };
}

// Kills the oldest-first order, a reply that ignores the status, and a link that skips safeHref.
test("toThread lists the oldest first, answers each status, and never links a non-http URL", () => {
  const entries = toThread([
    source(3, "failed", { error: "fetch 404" }),
    source(2, "done", { post: { id: 9, title: { hu: "Cím", en: "Title" } } }),
    source(1, "pending", { kind: "arxiv", url: "javascript:alert(1)", note: "Figyelj a módszertanra" }),
  ]);
  assert.deepEqual(entries.map(({ id }) => id), [1, 2, 3]);
  assert.deepEqual(entries.map(({ reply }) => reply), [
    { state: "pending", kind: "arxiv" },
    { state: "done", postId: 9, title: { hu: "Cím", en: "Title" } },
    { state: "failed", error: "fetch 404" },
  ]);
  assert.deepEqual(entries.map(({ href }) => href), [undefined, "https://blog.test/2", "https://blog.test/3"]);
  assert.equal(entries[0].note, "Figyelj a módszertanra");
});

// Review Focus 2. Kills `close()` keeping its timer (one more GET after the panel is gone), and a
// POLL_MS other than 4 s.
test("the thread polls every 4 s while the panel is open and a source is pending, and never after it closes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { chat, calls } = await opened(t);
  await wait(t, POLL_MS - 1);
  assert.equal(calls.mine, 1);
  await wait(t, 1);
  assert.equal(calls.mine, 2);
  chat.close();
  await wait(t, POLL_MS * 3);
  assert.equal(calls.mine, 2);
  assert.equal(POLL_MS, 4000);
});

// Kills the pending rule (a finished thread polls on), and the visibility rule (a hidden tab still fetches).
test("the thread polls only while a source is pending, and a hidden tab skips the fetch until it is visible again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const finished = await opened(t, [source(1, "done"), source(2, "failed")]);
  await wait(t, POLL_MS * 3);
  assert.equal(finished.calls.mine, 1);
  finished.chat.close();

  let visible = false;
  const { calls } = await opened(t, undefined, () => visible);
  await wait(t, POLL_MS);
  assert.equal(calls.mine, 1);
  visible = true;
  await wait(t, POLL_MS);
  assert.equal(calls.mine, 2);
});

// Kills the MAX_POLLS cap (a stuck pending source would poll as long as the panel stays open), and a
// count that opening the panel again doesn't restart.
test("polling stops after MAX_POLLS, and opening the panel again restarts it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { chat, calls } = await opened(t);
  for (let tick = 0; tick <= MAX_POLLS; tick++) await wait(t, POLL_MS);
  assert.equal(calls.mine, 1 + MAX_POLLS);
  chat.close();
  chat.open();
  await flush();
  await wait(t, POLL_MS);
  assert.equal(calls.mine, 1 + MAX_POLLS + 2);
});

// Kills the `latest` guard: a load that answers after a newer one would put a finished source back to
// pending, and, being the last word, keep showing it as processing.
test("an older load that answers late never overwrites a newer one", async (t) => {
  let answerFirst: (value: Answer) => void = () => {};
  const loads: Promise<Answer>[] = [
    new Promise((resolve) => {
      answerFirst = resolve;
    }),
    answer(200, { sources: [source(1, "done", { post: { id: 9, title: { hu: "Kész", en: "Done" } } })] })(),
  ];
  let call = 0;
  const chat = createLinkChat(fakeTransport([], { mine: () => loads[call++] }).transport, () => true);
  t.after(() => chat.close());
  chat.open();
  assert.equal(await chat.send("https://blog.test/1"), true);
  answerFirst({ status: 200, body: { sources: [source(1, "pending")] } });
  await flush();
  assert.equal(chat.getSnapshot().sources?.[0].status, "done");
});

// Kills an unreachable flag that the next good load doesn't clear, and a thread that never loaded and
// never asks again (spec 3.3: the next good load clears the reply, so one must come). A failed load
// says nothing on its own; the signed_out dedupe guard (mutation row 10) has its own test below,
// since `open()` now clears notices (Important 2), so repeating `open()` no longer proves the guard.
test("a failed load says the list is out of reach and polls again until a good one", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const loads = [offline, answer(200, { sources: [] })];
  let call = 0;
  const chat = createLinkChat(fakeTransport([], { mine: () => loads[Math.min(call++, loads.length - 1)]() }).transport, () => true);
  t.after(() => chat.close());
  chat.open();
  await flush();
  assert.equal(chat.getSnapshot().unreachable, true);
  assert.deepEqual(chat.getSnapshot().notices, []);
  await wait(t, POLL_MS);
  assert.equal(chat.getSnapshot().unreachable, false);
});

// Kills the signed_out dedupe's removal (mutation row 10): a send's own 401 refusal (through
// `noticeFor`), followed by the next poll's 401 (through `load`'s own branch), must say it once. The
// dedupe lives in `say` itself (not only in `load`) precisely because a real expired session answers
// 401 to *every* call, submit included — a retry that still gets a 202 before its GET turns 401
// (the old re-pin) can't actually happen, so it isn't a fair proof of the guard.
test("a send's 401 refusal and the next poll's 401 say signed_out once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const mineLoads = [answer(200, { sources: [source(1, "pending")] }), answer(401, { error: "unauthorized" })];
  let call = 0;
  const chat = createLinkChat(
    fakeTransport([], { mine: () => mineLoads[Math.min(call++, mineLoads.length - 1)](), submit: () => answer(401, { error: "unauthorized" })() })
      .transport,
    () => true,
  );
  t.after(() => chat.close());
  chat.open();
  await flush();
  assert.equal(await chat.send("https://blog.test/2"), false);
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "signed_out" }]);
  await wait(t, POLL_MS);
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "signed_out" }]);
});

// The same guard, proven through two retries that each answer 401 directly (a scenario that also
// really happens: two "Újra" clicks after the session already expired).
test("two retries that each answer 401 say signed_out once", async () => {
  const chat = createLinkChat(fakeTransport([], { retry: () => answer(401, { error: "unauthorized" })() }).transport, () => true);
  await chat.retry(1);
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "signed_out" }]);
  await chat.retry(1);
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "signed_out" }]);
});

// Kills the `pending` fallback losing `unreachable` once a list has ever loaded (Important 1): a
// finished thread whose next good load (after a send) blips once must still poll again and show the
// new submission, not sit forever behind a stale "nothing pending" read of the old list.
test("after a finished thread's load blips once, the new submission still lands", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const finished = source(1, "done", { post: { id: 9, title: { hu: "Kész", en: "Done" } } });
  const mineLoads = [answer(200, { sources: [finished] }), answer(500, { error: "db_error" }), answer(200, { sources: [source(2, "pending"), finished] })];
  let call = 0;
  const chat = createLinkChat(
    fakeTransport([], { mine: () => mineLoads[Math.min(call++, mineLoads.length - 1)](), submit: () => answer(202, { ok: true, id: 2 })() }).transport,
    () => true,
  );
  t.after(() => chat.close());
  chat.open();
  await flush();
  assert.equal(await chat.send("https://blog.test/2"), true);
  assert.equal(chat.getSnapshot().unreachable, true);
  await wait(t, POLL_MS);
  assert.equal(chat.getSnapshot().unreachable, false);
  assert.deepEqual(chat.getSnapshot().sources?.map((source) => source.id), [2, 1]);
});

// Kills `close()` not resetting notices while a send is still in flight (Important 2, spec 1.3): its
// late refusal must not leak into the next `open()`.
test("closing the panel while a send is in flight drops that send's reply on reopen", async (t) => {
  let answerSubmit: (value: Answer) => void = () => {};
  const chat = createLinkChat(fakeTransport([], { submit: () => new Promise((resolve) => (answerSubmit = resolve)) }).transport, () => true);
  t.after(() => chat.close());
  chat.open();
  await flush();
  const sent = chat.send("https://blog.test/a");
  chat.close();
  answerSubmit({ status: 400, body: { error: "invalid_url" } });
  await sent;
  chat.open();
  await flush();
  assert.deepEqual(chat.getSnapshot().notices, []);
});

// Kills `open()`'s `unreachable: false` reset (Important 2): a send's reload that fails after
// `close()` leaves `unreachable: true`; reopening must clear it synchronously, before its own reload
// even lands — a later check (after an `await`) would pass even without the reset, since the fresh
// reload's own good answer would clear it a moment later regardless.
test("reopening clears a stale unreachable synchronously, not just once its own reload lands", async (t) => {
  let answerSubmit: (value: Answer) => void = () => {};
  const mineLoads = [answer(200, { sources: [] }), offline, answer(200, { sources: [] })];
  let call = 0;
  const chat = createLinkChat(
    fakeTransport([], {
      mine: () => mineLoads[Math.min(call++, mineLoads.length - 1)](),
      submit: () => new Promise((resolve) => (answerSubmit = resolve)),
    }).transport,
    () => true,
  );
  t.after(() => chat.close());
  chat.open();
  await flush();
  const sent = chat.send("https://blog.test/a");
  chat.close();
  answerSubmit({ status: 202, body: { ok: true, id: 1 } });
  await sent;
  assert.equal(chat.getSnapshot().unreachable, true);
  chat.open();
  assert.equal(chat.getSnapshot().unreachable, false);
});

// Kills counting a hidden tick against MAX_POLLS (Minor 1): a tab hidden for the whole cap must still
// fetch once it becomes visible again.
test("a hidden tab's ticks don't count against MAX_POLLS; it still fetches once visible", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let visible = false;
  const { calls } = await opened(t, undefined, () => visible);
  for (let tick = 0; tick < MAX_POLLS + 10; tick++) await wait(t, POLL_MS);
  assert.equal(calls.mine, 1);
  visible = true;
  await wait(t, POLL_MS);
  assert.equal(calls.mine, 2);
});

// Kills a 401 falling through to `schedule()` (Minor 2), and — with `[offline, 401]`, not a good
// load before it — actually pins the 401 branch's own `set({ unreachable: false })`: a good first
// load would make that assertion true either way, since nothing had set it otherwise.
test("a 401 right after a failed load clears unreachable and stops polling on its own", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const loads = [offline, answer(401, { error: "unauthorized" })];
  let call = 0;
  const { transport, calls } = fakeTransport([], { mine: () => loads[Math.min(call++, loads.length - 1)]() });
  const chat = createLinkChat(transport, () => true);
  t.after(() => chat.close());
  chat.open();
  await flush();
  assert.equal(chat.getSnapshot().unreachable, true);
  await wait(t, POLL_MS);
  assert.deepEqual([chat.getSnapshot().unreachable, chat.getSnapshot().notices], [false, [{ kind: "signed_out" }]]);
  await wait(t, POLL_MS * 5);
  assert.equal(calls.mine, 2);
});

// Kills dropping the `clearTimeout(timer)` moved to the top of `load()`: the 401 branch returns
// before reaching `schedule()`'s own clearTimeout, so a timer armed before a retry's reload would
// otherwise survive a 401 untouched and fire one extra GET on its own, well after the panel stopped.
test("a retry's reload that lands a 401 leaves no old poll timer armed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const mineLoads = [answer(200, { sources: [source(1, "pending"), source(2, "failed")] }), answer(401, { error: "unauthorized" })];
  let call = 0;
  const { transport, calls } = fakeTransport([], {
    mine: () => mineLoads[Math.min(call++, mineLoads.length - 1)](),
    retry: () => answer(202, { ok: true })(),
  });
  const chat = createLinkChat(transport, () => true);
  t.after(() => chat.close());
  chat.open();
  await flush();
  await wait(t, 1000);
  await chat.retry(2);
  assert.equal(calls.mine, 2);
  await wait(t, POLL_MS * 2);
  assert.equal(calls.mine, 2);
});

// Kills removing `latest++` from `close()` (Minor 3a): a load already in flight when the panel closes
// must not land its answer afterward.
test("closing the panel while its opening load is in flight discards that load's answer", async () => {
  let fail: (error: unknown) => void = () => {};
  const chat = createLinkChat(fakeTransport([], { mine: () => new Promise((_, reject) => (fail = reject)) }).transport, () => true);
  chat.open();
  chat.close();
  fail(new TypeError("Failed to fetch"));
  await flush();
  assert.equal(chat.getSnapshot().unreachable, false);
});

// Kills removing `clearTimeout(timer)` from `schedule()` (Minor 3b): a send mid-cycle must leave a
// single poll chain running, not the old timer alongside a new one.
test("a send while a poll timer is armed keeps a single poll chain, not two", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { chat, calls } = await opened(t);
  await wait(t, 1000);
  assert.equal(await chat.send("https://blog.test/2"), true);
  const before = calls.mine;
  await wait(t, POLL_MS);
  assert.equal(calls.mine, before + 1);
});

// Kills removing `Array.isArray(answer.body.sources)` (Minor 3c): a 200 whose body isn't really a
// sources array must count as unreachable, not become the list (or crash the schedule right after).
test("a 200 with a non-array sources field counts as unreachable, not a crash or the list", async (t) => {
  const chat = createLinkChat(fakeTransport([], { mine: () => answer(200, { sources: "nope" })() }).transport, () => true);
  t.after(() => chat.close());
  chat.open();
  await flush();
  assert.equal(chat.getSnapshot().unreachable, true);
  assert.equal(chat.getSnapshot().sources, null);
});

// Review Focus 5, and every refusal the route answers. Kills an offline send that rejects instead of
// saying so, a 409 that drops its postId, and a refusal reported as sent (the panel would clear the field).
test("send: every refusal, offline included, becomes a reply and keeps the text", async () => {
  const cases: [() => Promise<Answer>, ChatNotice][] = [
    [answer(400, { error: "invalid_url" }), { kind: "invalid_url" }],
    [answer(409, { error: "already_submitted", postId: 9 }), { kind: "already_submitted", postId: 9 }],
    [answer(409, { error: "already_submitted" }), { kind: "already_submitted", postId: null }],
    [answer(401, { error: "unauthorized" }), { kind: "signed_out" }],
    [answer(500, { error: "insert_failed" }), { kind: "network" }],
    [offline, { kind: "network" }],
  ];
  for (const [submit, notice] of cases) {
    const chat = createLinkChat(fakeTransport([], { submit }).transport, () => true);
    assert.equal(await chat.send("https://blog.test/a"), false, notice.kind);
    assert.deepEqual(chat.getSnapshot().notices, [notice]);
    assert.equal(chat.getSnapshot().sending, false);
  }
});

// Kills a no-link message that still goes out, a 202 that waits for the next poll to show the new
// submission, and the "one link at a time" reply dropped. `t.after(close())` matters here even though
// the chat is never opened: its reload lands a pending source, and a `!open`-guard mutant elsewhere
// would otherwise arm a *real* setTimeout with no teardown to clear it (finding f).
test("send: no link, no request; a sent link reloads the thread at once and says when a second link was left out", async (t) => {
  const { transport, calls } = fakeTransport([source(1, "pending")]);
  const chat = createLinkChat(transport, () => true);
  t.after(() => chat.close());
  assert.equal(await chat.send("csak egy kérdés"), false);
  assert.deepEqual(calls.submit, []);
  assert.equal(await chat.send("https://a.test/1 és https://b.test/2"), true);
  assert.deepEqual(calls.submit, [["https://a.test/1", "és https://b.test/2"]]);
  assert.equal(calls.mine, 1);
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "no_link" }, { kind: "more_links" }]);
});

// Kills dropping the `!open` guard in `schedule()` (finding f): a send that lands while the chat was
// never opened must not start polling, even though the reload's thread holds a pending source —
// unbounded background polling here would otherwise run on live timers for as long as MAX_POLLS.
test("a send that lands without the panel ever open starts no polling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { transport, calls } = fakeTransport([source(1, "pending")]);
  const chat = createLinkChat(transport, () => true);
  t.after(() => chat.close());
  assert.equal(await chat.send("https://blog.test/1"), true);
  const before = calls.mine;
  await wait(t, POLL_MS * 3);
  assert.equal(calls.mine, before);
});

// Kills the `sending` guard: a quick double Enter would submit the link twice, and the second copy
// would come back as "Someone already sent this in".
test("send: a second send while the first is on its way sends nothing", async () => {
  let answerSubmit: (value: Answer) => void = () => {};
  const { transport, calls } = fakeTransport([], {
    submit: () =>
      new Promise((resolve) => {
        answerSubmit = resolve;
      }),
  });
  const chat = createLinkChat(transport, () => true);
  const sends = [chat.send("https://blog.test/a"), chat.send("https://blog.test/a")];
  assert.deepEqual(calls.submit, [["https://blog.test/a", null]]);
  answerSubmit({ status: 202, body: { ok: true, id: 1 } });
  assert.deepEqual(await Promise.all(sends), [true, false]);
});

// Kills `await reload()` → `void reload()` in `send` (Minor 3d): `sending` must stay true until the
// reloaded thread has actually landed, not just until submit answers.
test("send: sending stays true until the reload lands, not just until submit answers", async () => {
  let resolveMine: (value: Answer) => void = () => {};
  const chat = createLinkChat(
    fakeTransport([], { submit: () => answer(202, { ok: true, id: 1 })(), mine: () => new Promise((resolve) => (resolveMine = resolve)) }).transport,
    () => true,
  );
  const sendResult = chat.send("https://blog.test/a");
  await flush();
  assert.equal(chat.getSnapshot().sending, true);
  resolveMine({ status: 200, body: { sources: [] } });
  assert.equal(await sendResult, true);
  assert.equal(chat.getSnapshot().sending, false);
});

// Review Focus 1, the browser's half. Kills the in-flight guard (a double click sends two retries) and
// a 409 shown as an error: another click, or another tab, already started the run.
test("retry: a second click while the first is on its way sends nothing, and a 409 reloads the thread like a 202", async () => {
  let answerRetry: (value: Answer) => void = () => {};
  const { transport, calls } = fakeTransport([source(1, "failed")], {
    retry: () =>
      new Promise((resolve) => {
        answerRetry = resolve;
      }),
  });
  const chat = createLinkChat(transport, () => true);
  const clicks = [chat.retry(1), chat.retry(1)];
  assert.deepEqual(calls.retry, [1]);
  assert.deepEqual(chat.getSnapshot().retrying, [1]);
  answerRetry({ status: 409, body: { error: "not_failed" } });
  await Promise.all(clicks);
  assert.equal(calls.mine, 1);
  assert.deepEqual([chat.getSnapshot().notices, chat.getSnapshot().retrying], [[], []]);
});

// Kills `await reload()` → `void reload()` in `retry` (Minor 3d): `retrying` must stay true until the
// reloaded thread has actually landed, not just until retry answers.
test("retry: retrying stays true until the reload lands, not just until retry answers", async () => {
  let resolveMine: (value: Answer) => void = () => {};
  const chat = createLinkChat(
    fakeTransport([], { retry: () => answer(202, { ok: true })(), mine: () => new Promise((resolve) => (resolveMine = resolve)) }).transport,
    () => true,
  );
  const retryResult = chat.retry(1);
  await flush();
  assert.deepEqual(chat.getSnapshot().retrying, [1]);
  resolveMine({ status: 200, body: { sources: [] } });
  await retryResult;
  assert.deepEqual(chat.getSnapshot().retrying, []);
});

// Kills an offline or refused retry that rejects instead of saying so, or that keeps its button disabled.
test("retry: offline or refused, it says so and frees the button", async () => {
  for (const retry of [offline, answer(500, { error: "db_error" })]) {
    const chat = createLinkChat(fakeTransport([], { retry }).transport, () => true);
    await chat.retry(1);
    assert.deepEqual([chat.getSnapshot().notices, chat.getSnapshot().retrying], [[{ kind: "network" }], []]);
  }
});

// Kills local replies that outlive the panel: they live only while it stays open.
test("closing the panel drops the local replies", async (t) => {
  const chat = createLinkChat(fakeTransport([]).transport, () => true);
  t.after(() => chat.close());
  chat.open();
  await chat.send("nincs link");
  chat.close();
  assert.deepEqual(chat.getSnapshot().notices, []);
});

// Kills a preview that still accepts writes under fail=1, a preview submission missing from the
// thread, an id mismatch in retry's map (Minor 3e: only the targeted source may flip to pending), and
// answers that don't match the real routes (Minor 5): a duplicate url (with its postId only when that
// source already has a post), an unknown retry id, and a retry of a source that isn't failed.
test("memoryTransport: answers like the real routes, only the targeted retry flips, and fail rejects both", async () => {
  const dup = source(-2, "done", { url: "https://blog.test/dup", post: { id: 7, title: { hu: "x", en: "x" } } });
  const preview = memoryTransport([source(-1, "failed"), dup], false);
  assert.equal((await preview.submit("https://youtu.be/dQw4w9WgXcQ", null)).status, 202);
  assert.equal((await preview.submit("http://localhost/x", null)).status, 400);
  // Non-canonical case (a stored, already-normalized "blog.test" vs. a submitted "BLOG.test"): kills
  // comparing the raw `url` argument instead of `parsed.toString()`, since only the parsed form
  // lowercases the host to match what's actually stored.
  assert.deepEqual(await preview.submit("https://BLOG.test/dup", null), { status: 409, body: { error: "already_submitted", postId: 7 } });
  assert.deepEqual(await preview.retry(-999), { status: 404, body: { error: "not_found" } });
  assert.deepEqual(await preview.retry(-2), { status: 409, body: { error: "not_failed" } });
  await preview.retry(-1);
  const { body } = await preview.mine();
  assert.deepEqual((body.sources as MySource[]).map(({ id, kind, status }) => [id, kind, status]), [
    [-1000, "youtube", "pending"],
    [-1, "article", "pending"],
    [-2, "article", "done"],
  ]);
  const offlinePreview = memoryTransport([], true);
  await assert.rejects(offlinePreview.submit("https://blog.test/a", null), TypeError);
  await assert.rejects(offlinePreview.retry(-1), TypeError);
});

// Kills a duplicate submission that's missing its postId when the matching source has no post yet
// (Minor 5): the real route's `existingPostId` omits the key entirely, not `postId: null`.
test("memoryTransport: a duplicate of a postless source answers already_submitted with no postId key", async () => {
  const preview = memoryTransport([source(-1, "pending", { url: "https://blog.test/dup" })], false);
  const { status, body } = await preview.submit("https://blog.test/dup", null);
  assert.equal(status, 409);
  assert.deepEqual(body, { error: "already_submitted" });
  assert.ok(!("postId" in body));
});

// httpTransport is the only code here that reaches production (Minor 4): pin each call's path,
// method, header, body and cache, plus the shared non-JSON-body fallback.
test("httpTransport.mine: GET /api/sources/mine, uncached", async (t) => {
  const seen: { url: string; init?: RequestInit }[] = [];
  mockFetch(t, async (url, init) => {
    seen.push({ url, init });
    return Response.json({ sources: [] });
  });
  const { status, body } = await httpTransport.mine();
  assert.equal(seen[0].url, "/api/sources/mine");
  assert.equal(seen[0].init?.method, undefined);
  assert.equal(seen[0].init?.cache, "no-store");
  assert.equal(status, 200);
  assert.deepEqual(body, { sources: [] });
});

test("httpTransport.submit: POST /api/sources with a JSON body — a null note stays JSON null — and no-store", async (t) => {
  const seen: { url: string; init?: RequestInit }[] = [];
  mockFetch(t, async (url, init) => {
    seen.push({ url, init });
    return Response.json({ ok: true, id: 1 }, { status: 202 });
  });
  const { status, body } = await httpTransport.submit("https://blog.test/a", null);
  assert.equal(seen[0].url, "/api/sources");
  assert.equal(seen[0].init?.method, "POST");
  assert.equal((seen[0].init?.headers as Record<string, string> | undefined)?.["content-type"], "application/json");
  assert.deepEqual(JSON.parse(String(seen[0].init?.body)), { url: "https://blog.test/a", note: null });
  assert.equal(seen[0].init?.cache, "no-store");
  assert.equal(status, 202);
  assert.deepEqual(body, { ok: true, id: 1 });
});

test("httpTransport.retry: POST /api/sources/[id]/retry, uncached", async (t) => {
  const seen: { url: string; init?: RequestInit }[] = [];
  mockFetch(t, async (url, init) => {
    seen.push({ url, init });
    return Response.json({ ok: true }, { status: 202 });
  });
  const { status, body } = await httpTransport.retry(42);
  assert.equal(seen[0].url, "/api/sources/42/retry");
  assert.equal(seen[0].init?.method, "POST");
  assert.equal(seen[0].init?.cache, "no-store");
  assert.equal(status, 202);
  assert.deepEqual(body, { ok: true });
});

// Kills dropping the `.catch(() => null)` around `response.json()` (Minor 4): a non-JSON body must
// become `{}` and keep the real status, not throw.
test("httpTransport: a non-JSON error body becomes {} and keeps its status", async (t) => {
  mockFetch(t, async () => new Response("not json", { status: 500 }));
  const { status, body } = await httpTransport.mine();
  assert.equal(status, 500);
  assert.deepEqual(body, {});
});
