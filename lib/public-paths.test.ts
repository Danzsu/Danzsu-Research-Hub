import assert from "node:assert/strict";
import { test } from "node:test";
import { isDevPreviewPath, isPublicPath } from "./public-paths.ts";

test("isPublicPath lets the login, auth, API and media routes answer for themselves", () => {
  for (const path of ["/login", "/auth/callback", "/api/state", "/media/1/0123456789abcdef-640.avif"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ["/", "/library", "/library/7", "/archive", "/mediakit"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});

test("the offline preview skips sign-in in development only", () => {
  assert.equal(isDevPreviewPath("/dev/preview", "development"), true);
  for (const nodeEnv of ["production", "test", undefined]) assert.equal(isDevPreviewPath("/dev/preview", nodeEnv), false);
});

test("only the /dev/ folder counts, not look-alike paths", () => {
  for (const path of ["/dev", "/devices", "/developer/x", "/library/dev/preview"]) {
    assert.equal(isDevPreviewPath(path, "development"), false, path);
  }
});
