import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { isMediaKey, variantPath } from "../media.ts";
import { encodeImage, imageKey, mirrorImages, unusedMediaPaths } from "./images.ts";
import { mockFetch } from "./mock-fetch.ts";
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

const HOST = "http://93.184.216.34";
const image = (id: string, url: string): Block => ({ id, type: "image", originalUrl: url, alt: "", path: null });

function fakeDb(fail: (path: string) => boolean = () => false) {
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

test("mirrorImages applies the 30-image cap before any download starts", async () => {
  const { db } = fakeDb();
  let fetches = 0;
  const restore = mockFetch(async () => {
    fetches++;
    return new Response(await png(100, 100), { headers: { "content-type": "image/png" } });
  });
  try {
    const blocks = Array.from({ length: 35 }, (_, i) => image(`i${i}`, `${HOST}/${i}.png`));
    const out = await mirrorImages(db, 1, blocks);
    assert.equal(out.filter((b) => b.type === "image").length, 30);
    assert.equal(fetches, 30);
  } finally {
    restore();
  }
});

test("mirrorImages reuses a previously mirrored image by URL without re-fetching", async () => {
  const { db } = fakeDb();
  let fetches = 0;
  const restore = mockFetch(async () => {
    fetches++;
    return new Response("boom", { status: 500 });
  });
  try {
    const url = `${HOST}/cached.png`;
    const block = image("i1", url);
    const previous: Block[] = [
      { ...block, path: "1/abcdef0123456789", format: "avif", widths: [640], width: 900, height: 600, placeholder: "data:x" } as ImageBlock,
    ];
    const out = await mirrorImages(db, 1, [block], previous);
    assert.equal(fetches, 0);
    assert.equal((out[0] as ImageBlock).path, "1/abcdef0123456789");
  } finally {
    restore();
  }
});

test("mirrorImages drops an image too small to be content", async () => {
  const { db } = fakeDb();
  const restore = mockFetch(async () => new Response(await png(32, 32), { headers: { "content-type": "image/png" } }));
  try {
    const out = await mirrorImages(db, 1, [image("i1", `${HOST}/icon.png`)]);
    assert.equal(out.length, 0);
  } finally {
    restore();
  }
});

test("mirrorImages keeps the block with path: null when the download fails, and cancels its body", async () => {
  const { db } = fakeDb();
  let cancelled = false;
  const restore = mockFetch(async () => new Response(new ReadableStream({ cancel: () => { cancelled = true; } }), { status: 404 }));
  try {
    const out = await mirrorImages(db, 1, [image("i1", `${HOST}/missing.png`)]);
    assert.equal(out.length, 1);
    assert.equal((out[0] as ImageBlock).path, null);
    assert.equal(cancelled, true);
  } finally {
    restore();
  }
});

test("mirrorImages ignores a wrong content-type and lets sharp sniff the bytes", async () => {
  const { db, uploads } = fakeDb();
  const restore = mockFetch(async () => new Response(await png(200, 150), { headers: { "content-type": "binary/octet-stream" } }));
  try {
    const out = await mirrorImages(db, 1, [image("i1", `${HOST}/data.bin`)]);
    assert.notEqual((out[0] as ImageBlock).path, null);
    assert.ok(uploads.length > 0);
  } finally {
    restore();
  }
});

test("mirrorImages drops images past its time budget without fetching them", async () => {
  const { db } = fakeDb();
  let fetches = 0;
  const restore = mockFetch(async () => {
    fetches++;
    await new Promise((resolve) => setTimeout(resolve, 60));
    return new Response(await png(200, 150), { headers: { "content-type": "image/png" } });
  });
  try {
    const blocks = Array.from({ length: 8 }, (_, i) => image(`i${i}`, `${HOST}/${i}.png`));
    const out = await mirrorImages(db, 1, blocks, [], { budgetMs: 5 });
    const images = out.filter((b) => b.type === "image") as ImageBlock[];
    assert.equal(images.length, 8); // budget-skipped blocks are kept with path: null, not dropped
    assert.ok(fetches < 8, `expected some images to be skipped, got ${fetches} fetches`);
    assert.ok(images.some((b) => b.path === null));
  } finally {
    restore();
  }
});
