import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "./blocks.ts";
import { TITLE_MAX } from "./overrides.ts";
import { fakeDb } from "./pipeline/mock-fetch.ts";
import { editPayload, requestReextract, savePostEdits } from "./post-edit.ts";

const p = (text: string): BlockDraft => ({ type: "paragraph", content: [{ text }] });

const generated = { generatedTitle: { hu: "gépi cím", en: "model title" }, generatedSummary: { hu: "gépi összefoglaló", en: "model summary" } };

test("editPayload: hide-only (title/summary unchanged from the model) sends only hidden", () => {
  const draft = { title: generated.generatedTitle, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, draft, ["b1"]), { hidden: ["b1"] });
});

test("editPayload: an unchanged title is omitted, a changed summary is sent", () => {
  const draft = { title: generated.generatedTitle, summary: { hu: "új összefoglaló", en: generated.generatedSummary.en } };
  const payload = editPayload(generated, draft, []);
  assert.equal("title" in payload, false);
  assert.deepEqual(payload.summary, draft.summary);
});

test("editPayload: a changed HU title only sends the title, not the unchanged summary", () => {
  const draft = { title: { hu: "új cím", en: generated.generatedTitle.en }, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, draft, []), { title: draft.title, hidden: [] });
});

test("editPayload: a changed EN-only title also sends the title (N2 — a HU-only comparison would miss this)", () => {
  const draft = { title: { hu: generated.generatedTitle.hu, en: "a new EN title" }, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, draft, []), { title: draft.title, hidden: [] });
});

test("editPayload: trailing/leading whitespace alone doesn't count as a change (N3 — the server trims on save)", () => {
  const draft = {
    title: { hu: `${generated.generatedTitle.hu} `, en: generated.generatedTitle.en },
    summary: { hu: generated.generatedSummary.hu, en: `  ${generated.generatedSummary.en}` },
  };
  assert.deepEqual(editPayload(generated, draft, ["b1"]), { hidden: ["b1"] });
});

test("editPayload: a field reset back to the model text is omitted, clearing any existing override", () => {
  const edited = { title: { hu: "ideiglenes cím", en: generated.generatedTitle.en }, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, edited, []).title, edited.title);
  const reset = { title: generated.generatedTitle, summary: generated.generatedSummary }; // "Original" clicked
  assert.equal("title" in editPayload(generated, reset, []), false);
});

test("savePostEdits calls the RPC with filtered hidden ids, dropping unknown ones", async () => {
  const blocks = assignIds([p("a"), p("b")]);
  const db = fakeDb(undefined, { post: { id: 1, blocks } });
  const result = await savePostEdits(db, 1, { title: { hu: "cím", en: "title" }, hidden: [blocks[0].id, "ghost-id"] });
  assert.equal(result, "ok");
  assert.equal(db.rpcCalls.length, 1);
  assert.deepEqual(db.rpcCalls[0], {
    name: "update_post_overrides",
    args: { p_post: 1, p_overrides: { title: { hu: "cím", en: "title" } }, p_hidden: [blocks[0].id] },
  });
});

test("savePostEdits: invalid input is rejected before any RPC call", async () => {
  const db = fakeDb(undefined, { post: { id: 1, blocks: [] } });
  const result = await savePostEdits(db, 1, { hidden: "not-an-array" });
  assert.equal(result, "invalid");
  assert.equal(db.rpcCalls.length, 0);
});

test("savePostEdits: a 42501 RPC error maps to forbidden", async () => {
  const db = fakeDb(undefined, { post: { id: 1, blocks: [] }, rpcError: { code: "42501" } });
  const result = await savePostEdits(db, 1, { hidden: [] });
  assert.equal(result, "forbidden");
});

test("savePostEdits: a non-42501 RPC error maps to failed, not forbidden", async () => {
  const db = fakeDb(undefined, { post: { id: 1, blocks: [] }, rpcError: { code: "23505" } });
  const result = await savePostEdits(db, 1, { hidden: [] });
  assert.equal(result, "failed");
});

test("savePostEdits: a missing post gives not_found without calling the RPC", async () => {
  const db = fakeDb(undefined, { post: null });
  const result = await savePostEdits(db, 99, { hidden: [] });
  assert.equal(result, "not_found");
  assert.equal(db.rpcCalls.length, 0);
});

test("savePostEdits: a select error gives failed, not ignored as not_found or ok", async () => {
  const db = fakeDb(undefined, { post: { id: 1, blocks: [] }, postError: new Error("db down") });
  const result = await savePostEdits(db, 1, { hidden: [] });
  assert.equal(result, "failed");
  assert.equal(db.rpcCalls.length, 0);
});

test("savePostEdits: a title over the shared TITLE_MAX cap is invalid", async () => {
  const db = fakeDb(undefined, { post: { id: 1, blocks: [] } });
  const result = await savePostEdits(db, 1, { title: { hu: "x".repeat(TITLE_MAX + 1), en: "y" }, hidden: [] });
  assert.equal(result, "invalid");
  assert.equal(db.rpcCalls.length, 0);
});

test("requestReextract: a non-submitter is forbidden", async () => {
  const db = fakeDb(undefined, { post: { source_id: 5, extracted_at: null, sources: { submitted_by: "owner" } } });
  const result = await requestReextract(db, "someone-else", 1, new Date());
  assert.deepEqual(result, { status: "forbidden" });
  assert.equal(db.postUpdates.length, 0);
});

test("requestReextract: a null source (orphaned post) never passes the ownership check — forbidden, not a crash", async () => {
  const db = fakeDb(undefined, { post: { source_id: 5, extracted_at: null, sources: null } });
  const result = await requestReextract(db, "owner", 1, new Date());
  assert.deepEqual(result, { status: "forbidden" });
  assert.equal(db.postUpdates.length, 0);
});

test("requestReextract: a select error gives failed, not ignored as not_found", async () => {
  const db = fakeDb(undefined, {
    post: { source_id: 5, extracted_at: null, sources: { submitted_by: "owner" } },
    postError: new Error("db down"),
  });
  const result = await requestReextract(db, "owner", 1, new Date());
  assert.deepEqual(result, { status: "failed" });
});

test("requestReextract: a missing post gives not_found", async () => {
  const db = fakeDb(undefined, { post: null });
  const result = await requestReextract(db, "owner", 1, new Date());
  assert.deepEqual(result, { status: "not_found" });
});

test("requestReextract: inside the cooldown window returns a sane retryAfter, no CAS attempted", async () => {
  const now = new Date("2026-01-01T00:05:00Z");
  const extractedAt = "2026-01-01T00:00:00Z"; // 5 minutes ago, cooldown is 10 minutes
  const db = fakeDb(undefined, { post: { source_id: 5, extracted_at: extractedAt, sources: { submitted_by: "owner" } } });
  const result = await requestReextract(db, "owner", 1, now);
  assert.equal(result.status, "cooldown");
  assert.ok(result.status === "cooldown" && result.retryAfter > 0 && result.retryAfter <= 300, JSON.stringify(result));
  assert.equal(db.postUpdates.length, 0);
});

test("requestReextract: a lost compare-and-swap (concurrent claim) gives cooldown", async () => {
  // A plain fixture object can't move between our own read and our CAS — nothing in this
  // single-threaded fake mutates it in between. A getter simulates that: the first read (this
  // run's own select) sees the row as never-extracted, but the second read (the update's own
  // match check against the live row) sees a timestamp another request already claimed —
  // modelling exactly the race the CAS guard exists to catch.
  let reads = 0;
  const post = {
    id: 1,
    source_id: 5,
    sources: { submitted_by: "owner" },
    get extracted_at() {
      reads++;
      return reads === 1 ? null : "2026-01-01T00:00:00Z";
    },
  };
  const db = fakeDb(undefined, { post });
  const result = await requestReextract(db, "owner", 1, new Date("2026-01-01T00:10:00Z"));
  assert.equal(result.status, "cooldown");
  assert.ok(result.status === "cooldown" && result.retryAfter > 0, JSON.stringify(result));
});

test("requestReextract: a successful claim after the cooldown expires writes extracted_at=now via .eq(id).eq(extracted_at) and returns sourceId", async () => {
  const now = new Date("2026-01-01T00:11:00Z");
  const previous = "2026-01-01T00:00:00Z"; // 11 minutes ago, cooldown is 10
  const db = fakeDb(undefined, { post: { id: 1, source_id: 5, extracted_at: previous, sources: { submitted_by: "owner" } } });
  const result = await requestReextract(db, "owner", 1, now);
  assert.deepEqual(result, { status: "accepted", sourceId: 5 });
  assert.deepEqual(db.postUpdates[0], { extracted_at: now.toISOString() });
  // M5: the CAS must also filter by id, or the legacy `.is(null)` branch below would match (and
  // bump) every never-extracted post in the table, not just this one.
  assert.deepEqual(db.postUpdateFilters[0], [
    { column: "id", value: 1, op: "eq" },
    { column: "extracted_at", value: previous, op: "eq" },
  ]);
});

test("requestReextract: a legacy null extracted_at claims via .eq(id).is(extracted_at, null), not .eq", async () => {
  const now = new Date("2026-01-01T00:10:00Z");
  const db = fakeDb(undefined, { post: { id: 1, source_id: 5, extracted_at: null, sources: { submitted_by: "owner" } } });
  const result = await requestReextract(db, "owner", 1, now);
  assert.deepEqual(result, { status: "accepted", sourceId: 5 });
  assert.deepEqual(db.postUpdateFilters[0], [
    { column: "id", value: 1, op: "eq" },
    { column: "extracted_at", value: null, op: "is" },
  ]);
});

test("requestReextract: a claim (update) error gives failed, not cooldown", async () => {
  const now = new Date("2026-01-01T00:11:00Z");
  const previous = "2026-01-01T00:00:00Z"; // cooldown already expired, so a CAS is attempted
  const db = fakeDb(undefined, {
    post: { id: 1, source_id: 5, extracted_at: previous, sources: { submitted_by: "owner" } },
    postUpdateError: new Error("write failed"),
  });
  const result = await requestReextract(db, "owner", 1, now);
  assert.deepEqual(result, { status: "failed" });
});
