import assert from "node:assert/strict";
import { test } from "node:test";
import config from "./next.config.ts";

// Review Focus 2. Kills the old /archive/github links (bookmarks, the Google console) going 404.
test("the archive's old github tab redirects to /github for good", async () => {
  const redirects = await config.redirects!();
  assert.deepEqual(redirects, [{ source: "/archive/github", destination: "/github", permanent: true }]);
});
