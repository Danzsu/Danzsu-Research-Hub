import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const KEY = "1/0123456789abcdef-640.avif";
const WEBP_KEY = "1/fedcba0123456789-640.webp";
const get = (key: string) => GET(new Request(`http://localhost/media/${key}`), { params: Promise.resolve({ path: key.split("/") }) });

function signedInWithMedia() {
  resetRoute();
  routeStub.reader = signedIn(fakeDb());
  routeStub.admin = fakeDb(undefined, { media: ["0123456789abcdef-640.avif", "fedcba0123456789-640.webp"] });
}

// X2 (/media downloads any key) and M1 (isMediaKey loses its ^ or $ anchor): the bucket is private,
// and only content-addressed image keys are served, however the key is dressed up.
test("/media answers 404 for anything but an image key, without opening the bucket", async () => {
  signedInWithMedia();
  for (const key of ["../secret.txt", `x${KEY}`, `evil/${KEY}`, "1/0123456789abcdef-640.svg", "1/0123456789abcdef.avif", `${KEY}.svg`, `${KEY}/x`]) {
    const response = await get(key);
    assert.equal(response.status, 404, key);
  }
  assert.equal(routeStub.adminCalls, 0);
});

test("/media answers 401 to a signed-out request, without opening the bucket", async () => {
  resetRoute();
  const response = await get(KEY);
  assert.equal(response.status, 401);
  assert.equal(routeStub.adminCalls, 0);
});

// N2: a mirrored image is a member's copy of someone else's page; a shared cache must never keep it.
test("/media serves an image privately, never sniffed, with no active content", async (t) => {
  t.mock.method(console, "warn", () => {}); // the missing key below
  signedInWithMedia();
  const response = await get(KEY);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), KEY); // the fake bucket's bytes for exactly this key
  assert.equal(response.headers.get("content-type"), "image/avif");
  assert.equal(response.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'");
  assert.equal((await get("1/fedcba9876543210-640.avif")).status, 404); // an image key the bucket doesn't hold

  const webpResponse = await get(WEBP_KEY); // pins the extension→content-type mapping: a hardcoded "image/avif" would fail here
  assert.equal(webpResponse.status, 200);
  assert.equal(webpResponse.headers.get("content-type"), "image/webp");
});
