import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  createLinkChat,
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

// Kills an unreachable flag that the next good load doesn't clear, a thread that never loaded and
// never asks again (spec 3.3: the next good load clears the reply, so one must come), a failed load
// that says nothing, and a 401 said again on every poll.
test("a failed load says the list is out of reach and polls again until a good one; a 401 asks, once, to sign in again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const loads = [offline, answer(200, { sources: [] }), answer(401, { error: "unauthorized" }), answer(401, { error: "unauthorized" })];
  let call = 0;
  const chat = createLinkChat(fakeTransport([], { mine: () => loads[call++]() }).transport, () => true);
  t.after(() => chat.close());
  chat.open();
  await flush();
  assert.equal(chat.getSnapshot().unreachable, true);
  await wait(t, POLL_MS);
  assert.equal(chat.getSnapshot().unreachable, false);
  chat.open();
  await flush();
  chat.open();
  await flush();
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "signed_out" }]);
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
// submission, and the "one link at a time" reply dropped.
test("send: no link, no request; a sent link reloads the thread at once and says when a second link was left out", async () => {
  const { transport, calls } = fakeTransport([source(1, "pending")]);
  const chat = createLinkChat(transport, () => true);
  assert.equal(await chat.send("csak egy kérdés"), false);
  assert.deepEqual(calls.submit, []);
  assert.equal(await chat.send("https://a.test/1 és https://b.test/2"), true);
  assert.deepEqual(calls.submit, [["https://a.test/1", "és https://b.test/2"]]);
  assert.equal(calls.mine, 1);
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "no_link" }, { kind: "more_links" }]);
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

// Kills a preview that still accepts writes under fail=1, and a preview submission missing from the thread.
test("memoryTransport: a submission joins the thread newest first as pending, a retry sends a failed one back, and fail rejects both", async () => {
  const preview = memoryTransport([source(-1, "failed")], false);
  assert.equal((await preview.submit("https://youtu.be/dQw4w9WgXcQ", null)).status, 202);
  assert.equal((await preview.submit("http://localhost/x", null)).status, 400);
  await preview.retry(-1);
  const { body } = await preview.mine();
  assert.deepEqual((body.sources as MySource[]).map(({ kind, status }) => [kind, status]), [["youtube", "pending"], ["article", "pending"]]);
  const offlinePreview = memoryTransport([], true);
  await assert.rejects(offlinePreview.submit("https://blog.test/a", null), TypeError);
  await assert.rejects(offlinePreview.retry(-1), TypeError);
});
