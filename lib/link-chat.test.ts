import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinkMessage } from "./link-chat.ts";

const linkOf = (text: string) => {
  const message = parseLinkMessage(text);
  return "url" in message ? message.url : null;
};
const noteOf = (text: string) => {
  const message = parseLinkMessage(text);
  return "note" in message ? message.note : undefined;
};

// Kills a message with no link sent as one ("https://" alone, or a link glued to a word, is none).
test("parseLinkMessage finds no link in plain text, a bare scheme, or a link glued to a word", () => {
  for (const text of ["szia, mi újság?", "   ", "https://", "Nézd:https://example.test/a"]) {
    assert.deepEqual(parseLinkMessage(text), { error: "no_link" }, text);
  }
});

// Kills the note keeping the link, and a note that isn't the rest of the message.
test("parseLinkMessage takes the link and keeps the rest of the message as its note", () => {
  assert.deepEqual(parseLinkMessage("https://example.test/a nézd meg a második részt"), {
    url: "https://example.test/a",
    note: "nézd meg a második részt",
    moreLinks: false,
  });
});

// Review Focus 4. Kills the CLOSING strip (the full stop ends up in the URL, a 404), the OPENING strip
// (a link in parentheses is not found), and the balanced-parenthesis rule (Wikipedia's links break).
test("parseLinkMessage strips sentence punctuation around the link, but keeps a parenthesis the link itself opened", () => {
  assert.equal(linkOf("Ezt olvasd: https://example.test/a."), "https://example.test/a");
  assert.equal(linkOf("Szerinted jó? https://example.test/a?!"), "https://example.test/a");
  assert.equal(linkOf('"https://example.test/a",'), "https://example.test/a");
  assert.equal(linkOf("(https://example.test/a) fontos"), "https://example.test/a");
  assert.equal(linkOf("https://en.wikipedia.org/wiki/Taiyaki_(food)."), "https://en.wikipedia.org/wiki/Taiyaki_(food)");
  assert.equal(linkOf("(lásd https://en.wikipedia.org/wiki/Taiyaki_(food))"), "https://en.wikipedia.org/wiki/Taiyaki_(food)");
  assert.equal(linkOf("<https://example.test/a>"), "https://example.test/a");
});

// Review Focus 4. Kills `moreLinks` always false (the reader never learns the second link was left
// out), and the second link dropped from the note.
test("parseLinkMessage sends the first of several links and says there were more", () => {
  assert.deepEqual(parseLinkMessage("https://a.test/1 és https://b.test/2"), {
    url: "https://a.test/1",
    note: "és https://b.test/2",
    moreLinks: true,
  });
});

// Kills `note || null` (an empty string is stored as a note), and a note whose whitespace isn't collapsed.
test("parseLinkMessage collapses the note's whitespace, and a blank one is null", () => {
  assert.equal(noteOf("  https://example.test/a  \n\t "), null);
  assert.equal(noteOf("sok   szóköz\n\nés sor https://example.test/a"), "sok szóköz és sor");
});

// Kills the `i` flag: a pasted "HTTPS://" link is still a link. The route's parseSubmittedUrl lowercases it.
test("parseLinkMessage takes an upper-case scheme as a link, as typed", () => {
  assert.deepEqual(parseLinkMessage("HTTPS://EXAMPLE.TEST/A"), { url: "HTTPS://EXAMPLE.TEST/A", note: null, moreLinks: false });
});
