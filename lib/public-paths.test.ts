import assert from "node:assert/strict";
import { test } from "node:test";
import { isDevPreviewPath, isPublicPath, signedOutTarget } from "./public-paths.ts";

test("isPublicPath lets the login, auth, API and media routes answer for themselves", () => {
  for (const path of ["/login", "/auth/callback", "/api/state", "/media/1/0123456789abcdef-640.avif", "/about", "/privacy"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ["/", "/library", "/library/7", "/archive", "/mediakit", "/about/x", "/privacy-notes"]) {
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

// Kills the home sent to sign-in (a visitor would never see the landing page), a query carried to /about,
// and any other page losing its way back.
test("signedOutTarget sends the home to the landing page and every other page to sign-in with its way back", () => {
  assert.equal(signedOutTarget("/", ""), "/about");
  assert.equal(signedOutTarget("/", "?a=1"), "/about");
  assert.equal(signedOutTarget("/library", "?x=1"), "/login?next=%2Flibrary%3Fx%3D1");
  assert.equal(signedOutTarget("/archive/2026-W38", ""), "/login?next=%2Farchive%2F2026-W38");
});
