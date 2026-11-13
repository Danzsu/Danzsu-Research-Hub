import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const ask = (q: string) => GET(new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`));

test("GET /api/search answers 401 signed out, and never reaches the database", async () => {
  resetRoute();
  const response = await ask("cache");
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});

// Kills the palette's limit dropped (it would list 40) and the reader's own client swapped for another.
test("GET /api/search answers the matches of the tidied query, at most 8, as the reader", async () => {
  resetRoute();
  const db = fakeDb(undefined, { rpcData: [{ kind: "post", id: 3, title: "T", snippet: "S", href: "/library/3", url: null, meta: "M" }] });
  routeStub.reader = signedIn(db);
  const response = await ask("  kv  cache ");
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).hits.map((hit: { id: string }) => hit.id), ["3"]);
  assert.deepEqual(db.rpcCalls, [{ name: "search_all", args: { q: "kv cache", lim: 8 } }]);
});

test("GET /api/search answers 500 db_error when the query fails", async (t) => {
  resetRoute();
  t.mock.method(console, "error", () => {});
  routeStub.reader = signedIn(fakeDb(undefined, { rpcError: pgError("08006", "down") }));
  const response = await ask("cache");
  assert.deepEqual([response.status, await response.json()], [500, { error: "db_error" }]);
});
