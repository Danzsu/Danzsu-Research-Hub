import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicPath } from "./public-paths.ts";

test("isPublicPath lets the login, auth, API and media routes answer for themselves", () => {
  for (const path of ["/login", "/auth/callback", "/api/state", "/media/1/0123456789abcdef-640.avif"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ["/", "/library", "/library/7", "/archive", "/mediakit"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});
