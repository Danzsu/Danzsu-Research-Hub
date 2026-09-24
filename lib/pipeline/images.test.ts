import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { isMediaKey, variantPath } from "../media.ts";
import { encodeImage, imageKey, unusedMediaPaths } from "./images.ts";
import type { Block } from "../blocks.ts";

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

test("image keys are content-addressed and validated", () => {
  const key = imageKey(42, "https://x.test/a.png");
  assert.equal(key, imageKey(42, "https://x.test/a.png"));
  assert.match(key, /^42\/[0-9a-f]{16}$/);
  assert.equal(variantPath(key, 640, "avif"), `${key}-640.avif`);
  assert.equal(isMediaKey(`${key}-640.avif`), true);
  assert.equal(isMediaKey("../secret"), false);
  assert.equal(isMediaKey(`${key}-640.png`), false);
});

test("unusedMediaPaths keeps every variant still referenced", () => {
  const key = imageKey(1, "https://x.test/a.png");
  const blocks: Block[] = [
    { id: "i1", type: "image", originalUrl: "https://x.test/a.png", alt: "", path: key, format: "avif", widths: [640, 1280] },
  ];
  const existing = [`${key}-640.avif`, `${key}-1280.avif`, "1/deadbeefdeadbeef-640.avif"];
  assert.deepEqual(unusedMediaPaths(existing, blocks), ["1/deadbeefdeadbeef-640.avif"]);
});
