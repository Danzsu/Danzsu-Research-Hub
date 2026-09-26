import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { isMediaKey, variantPath } from "../media.ts";
import { FETCH_TIMEOUT_MS, encodeImage, imageKey, mirrorImages, unusedMediaPaths } from "./images.ts";
import { endlessBody, mockDns, mockFetch, TEST_HOST } from "./mock-fetch.ts";
import type { Block, ImageBlock } from "../blocks.ts";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#f15f22" } }).png().toBuffer();

test("encodeImage makes 640 and 1280 AVIF variants plus a placeholder", async () => {
  const encoded = await encodeImage(await png(2000, 1000));
  assert.ok(encoded);
  assert.equal(encoded.format, "avif");
  assert.deepEqual(encoded.variants.map((v) => v.width), [640, 1280]);
  assert.equal(encoded.width, 2000);
  assert.equal(encoded.height, 1000);
  assert.match(encoded.placeholder ?? "", /^data:image\/webp;base64,/);
  assert.equal((await sharp(encoded.variants[1].data).metadata()).width, 1280);
});

test("encodeImage keeps small images at their own width and drops icons", async () => {
  const small = await encodeImage(await png(300, 200));
  assert.deepEqual(small?.variants.map((v) => v.width), [300]);
  assert.equal(await encodeImage(await png(32, 32)), null);
});

test("encodeImage corrects EXIF orientation instead of reporting a sideways image", async () => {
  // A JPEG physically stored 1600x800 but tagged orientation=6 (rotate 90cw): displays as 800x1600.
  const rotated = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#59e1e8" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const encoded = await encodeImage(rotated);
  assert.ok(encoded);
  assert.equal(encoded.width, 800);
  assert.equal(encoded.height, 1600);
  assert.deepEqual(encoded.variants.map((v) => v.width), [640, 800]);
  const widest = await sharp(encoded.variants[1].data).metadata();
  assert.equal(widest.width, 800);
  assert.equal(widest.height, 1600);
  const narrow = await sharp(encoded.variants[0].data).metadata();
  assert.equal(narrow.width, 640);
  assert.equal(narrow.height, 1280);
});

test("encodeImage rasterizes SVG instead of storing markup (stored-XSS guard)", async () => {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(document.cookie)</script><rect width="200" height="200" fill="red"/></svg>`,
  );
  const encoded = await encodeImage(svg);
  assert.ok(encoded);
  assert.equal(encoded.format, "avif");
  assert.equal(encoded.variants.length, 2);
  for (const variant of encoded.variants) {
    assert.equal((await sharp(variant.data).metadata()).format, "heif"); // avif container
    assert.ok(!variant.data.toString("latin1").includes("<script"), "encoded bytes must not carry the source markup");
  }
});

test("encodeImage still yields a variant for a narrow, very tall SVG", async () => {
  // 400x8000: hitting the 1280px width target at density would push the decoded height
  // past libheif's per-dimension limit; the density (and, as a backstop, a failing variant)
  // must not lose the image entirely.
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="8000"><rect width="400" height="8000" fill="red"/></svg>`);
  const encoded = await encodeImage(svg);
  assert.ok(encoded);
  assert.ok(encoded.variants.length > 0);
  for (const variant of encoded.variants) {
    const meta = await sharp(variant.data).metadata();
    assert.ok((meta.height ?? 0) <= 16_384);
  }
});

test("image keys are content-addressed to the downloaded bytes, not the URL", () => {
  const bytes = Buffer.from("same bytes");
  const key = imageKey(42, bytes);
  assert.equal(key, imageKey(42, Buffer.from("same bytes")));
  assert.notEqual(key, imageKey(42, Buffer.from("different bytes")));
  assert.match(key, /^42\/[0-9a-f]{16}$/);
  assert.equal(variantPath(key, 640, "avif"), `${key}-640.avif`);
  assert.equal(isMediaKey(`${key}-640.avif`), true);
  assert.equal(isMediaKey("../secret"), false);
  assert.equal(isMediaKey(`${key}-640.png`), false);
  assert.equal(isMediaKey(`${key}-640.svg`), false); // SVG is never stored as-is
});

test("unusedMediaPaths keeps every variant still referenced", () => {
  const key = imageKey(1, Buffer.from("a.png"));
  const blocks: Block[] = [
    { id: "i1", type: "image", originalUrl: "https://x.test/a.png", alt: "", path: key, format: "avif", widths: [640, 1280] },
  ];
  const existing = [`${key}-640.avif`, `${key}-1280.avif`, "1/deadbeefdeadbeef-640.avif"];
  assert.deepEqual(unusedMediaPaths(existing, blocks), ["1/deadbeefdeadbeef-640.avif"]);
});

// --- mirrorImages: fake Storage, mocked global fetch, public IP-literal URLs ---
// (an IP literal makes `lookup()` a local, offline operation — safeFetch's DNS check needs no network.)

const HOST = TEST_HOST;
const image = (id: string, url: string): Block => ({ id, type: "image", originalUrl: url, alt: "", path: null });

function fakeStorageDb(fail: (path: string) => boolean = () => false) {
  const uploads: { path: string; bytes: number }[] = [];
  const db = {
    storage: {
      from: () => ({
        upload: async (path: string, data: Buffer) => {
          uploads.push({ path, bytes: data.length });
          return fail(path) ? { error: new Error("storage down") } : { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { db, uploads };
}

test("mirrorImages applies the 30-image cap before any download starts", async (t) => {
  const { db } = fakeStorageDb();
  let fetches = 0;
  mockFetch(t, async () => {
    fetches++;
    return new Response(await png(100, 100), { headers: { "content-type": "image/png" } });
  });
  const blocks = Array.from({ length: 35 }, (_, i) => image(`i${i}`, `${HOST}/${i}.png`));
  const out = await mirrorImages(db, 1, blocks);
  assert.equal(out.filter((b) => b.type === "image").length, 30);
  assert.equal(fetches, 30);
});

test("mirrorImages reuses a previously mirrored image by URL without re-fetching", async (t) => {
  const { db } = fakeStorageDb();
  let fetches = 0;
  mockFetch(t, async () => {
    fetches++;
    return new Response("boom", { status: 500 });
  });
  const url = `${HOST}/cached.png`;
  const block = image("i1", url);
  const previous: Block[] = [
    { ...block, path: "1/abcdef0123456789", format: "avif", widths: [640], width: 900, height: 600, placeholder: "data:x" } as ImageBlock,
  ];
  const out = await mirrorImages(db, 1, [block], previous);
  assert.equal(fetches, 0);
  assert.equal((out[0] as ImageBlock).path, "1/abcdef0123456789");
});

test("mirrorImages drops an image too small to be content", async (t) => {
  const { db } = fakeStorageDb();
  mockFetch(t, async () => new Response(await png(32, 32), { headers: { "content-type": "image/png" } }));
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/icon.png`)]);
  assert.equal(out.length, 0);
});

test("mirrorImages keeps the block with path: null when the download fails, and cancels its body", async (t) => {
  const { db } = fakeStorageDb();
  const { body, cancelled, reads } = endlessBody();
  mockFetch(t, async () => new Response(body, { status: 404 }));
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/missing.png`)]);
  assert.equal(out.length, 1);
  assert.equal((out[0] as ImageBlock).path, null);
  assert.equal(cancelled(), true);
  assert.equal(reads(), 0); // the error page is never downloaded, let alone handed to sharp
});

test("mirrorImages keeps an image whose every variant fails to encode, unmirrored, instead of dropping it", async (t) => {
  const { db, uploads } = fakeStorageDb();
  t.mock.method(console, "warn", () => {});
  // The header (and so the size) reads fine; the pixel data is cut off, so every resize fails.
  const truncated = (await png(200, 150)).subarray(0, 100);
  await assert.rejects(() => encodeImage(truncated), /no image variant could be encoded/);
  mockFetch(t, async () => new Response(truncated, { headers: { "content-type": "image/png" } }));
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/broken.png`)]);
  assert.equal(out.length, 1);
  assert.equal((out[0] as ImageBlock).path, null);
  assert.equal(uploads.length, 0);
});

test("mirrorImages ignores a wrong content-type and lets sharp sniff the bytes", async (t) => {
  const { db, uploads } = fakeStorageDb();
  mockFetch(t, async () => new Response(await png(200, 150), { headers: { "content-type": "binary/octet-stream" } }));
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/data.bin`)]);
  assert.notEqual((out[0] as ImageBlock).path, null);
  assert.ok(uploads.length > 0);
});

test("mirrorImages drops images past its time budget without fetching them", async (t) => {
  const { db } = fakeStorageDb();
  let fetches = 0;
  mockFetch(t, async () => {
    fetches++;
    await new Promise((resolve) => setTimeout(resolve, 60));
    return new Response(await png(200, 150), { headers: { "content-type": "image/png" } });
  });
  const blocks = Array.from({ length: 8 }, (_, i) => image(`i${i}`, `${HOST}/${i}.png`));
  const out = await mirrorImages(db, 1, blocks, [], { budgetMs: 5 });
  const images = out.filter((b) => b.type === "image") as ImageBlock[];
  assert.equal(images.length, 8); // budget-skipped blocks are kept with path: null, not dropped
  assert.ok(fetches < 8, `expected some images to be skipped, got ${fetches} fetches`);
  assert.ok(images.some((b) => b.path === null));
});

test("mirrorImages with budgetMs: 0 starts no downloads at all", async (t) => {
  const { db } = fakeStorageDb();
  let fetches = 0;
  mockFetch(t, async () => {
    fetches++;
    return new Response(await png(200, 150), { headers: { "content-type": "image/png" } });
  });
  const blocks = Array.from({ length: 4 }, (_, i) => image(`i${i}`, `${HOST}/${i}.png`));
  const out = await mirrorImages(db, 1, blocks, [], { budgetMs: 0 });
  const images = out.filter((b) => b.type === "image") as ImageBlock[];
  assert.equal(fetches, 0); // a zero (or already-exhausted) budget must not start even the first download
  assert.equal(images.length, 4);
  assert.ok(images.every((b) => b.path === null));
});

test("mirrorImages keys uploaded variants by the downloaded bytes, not the URL", async (t) => {
  const { db, uploads } = fakeStorageDb();
  const bytes = await png(200, 150);
  // Two different URLs, byte-identical response: a URL-derived key would give them different paths.
  mockFetch(t, async () => new Response(bytes, { headers: { "content-type": "image/png" } }));
  const out = await mirrorImages(db, 9, [image("i1", `${HOST}/a.png`), image("i2", `${HOST}/b.png`)]);
  const blocks = out.filter((b) => b.type === "image") as ImageBlock[];
  assert.equal(blocks.length, 2);
  const expectedKey = imageKey(9, bytes);
  assert.equal(blocks[0].path, expectedKey);
  assert.equal(blocks[1].path, expectedKey); // identical bytes -> identical path, regardless of URL
  assert.ok(uploads.length > 0);
  assert.ok(uploads.every((u) => u.path.startsWith(`${expectedKey}-`)));
});

// G1, N13: a hung image host costs one FETCH_TIMEOUT_MS, not the whole image budget. The response
// below never comes, so only the download's own abort signal can end it; the stubbed clock makes that
// timeout fire at once and records how long it was asked to be.
test("mirrorImages aborts a download that hangs past FETCH_TIMEOUT_MS and keeps the block unmirrored", { timeout: 5_000 }, async (t) => {
  const { db, uploads } = fakeStorageDb();
  t.mock.method(console, "warn", () => {});
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  const asked: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    asked.push(ms);
    return realTimeout(1);
  });
  mockFetch(t, (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
    }),
  );
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/hangs.png`)]);
  assert.deepEqual(asked, [FETCH_TIMEOUT_MS]);
  assert.equal((out[0] as ImageBlock).path, null);
  assert.equal(uploads.length, 0);
});

// G1b: every image URL on a submitted page is fetched server-side, next to the secret key.
test("mirrorImages never fetches an image on a private address, and keeps it unmirrored", async (t) => {
  const { db, uploads } = fakeStorageDb();
  t.mock.method(console, "warn", () => {});
  mockDns(t, "10.0.0.1"); // cdn.example.test resolves to a private address
  let fetches = 0;
  mockFetch(t, async () => {
    fetches++;
    return new Response(await png(200, 150), { headers: { "content-type": "image/png" } });
  });
  const blocks = ["http://127.0.0.1/x.png", "http://cdn.example.test/y.png", "http://169.254.169.254/latest/meta-data/"].map((url, i) => image(`i${i}`, url));
  const out = await mirrorImages(db, 1, blocks);
  assert.equal(fetches, 0);
  assert.deepEqual(out.map((block) => (block as ImageBlock).path), [null, null, null]);
  assert.equal(uploads.length, 0);
});

// G2: a small file can decode to billions of pixels (a decompression bomb); sharp refuses past PIXEL_LIMIT.
test("encodeImage refuses an image over the 40-megapixel limit", async () => {
  const huge = await sharp({ create: { width: 8000, height: 5001, channels: 3, background: "#141414" } }).png().toBuffer();
  await assert.rejects(() => encodeImage(huge), /pixel limit/);
});

// G3: an image declared over 5 MB is refused before a single byte is read, let alone handed to sharp.
test("mirrorImages keeps a 5 MB + 1 byte image unmirrored, without reading it", async (t) => {
  const { db, uploads } = fakeStorageDb();
  t.mock.method(console, "warn", () => {});
  const { body, cancelled, reads } = endlessBody(1024 * 1024);
  mockFetch(t, async () => new Response(body, { headers: { "content-type": "image/png", "content-length": String(5 * 1024 * 1024 + 1) } }));
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/big.png`)]);
  assert.equal((out[0] as ImageBlock).path, null);
  assert.equal(uploads.length, 0);
  assert.equal(cancelled(), true);
  assert.equal(reads(), 0); // the declared length alone decides; nothing is pulled from the body
});
