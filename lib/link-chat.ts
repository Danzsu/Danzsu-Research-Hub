// The taiyaki link chat's logic, framework-free so node --test runs it: a message → a submission,
// the reader's own sources → the thread, and the live thread's polling rules. The panel
// (app/components/link-chat.tsx) binds it to React.

export type LinkMessage = { url: string; note: string | null; moreLinks: boolean } | { error: "no_link" };

const OPENING = /^[([{<'"„“‘«]+/;
const CLOSING = /[.,;:!?)\]}>'"”’»…]$/;
const count = (text: string, char: string) => text.split(char).length - 1;

/** True when the link's trailing `)` or `]` closes one it opened itself, not sentence punctuation:
 *  Wikipedia's `…/Taiyaki_(food)`, or IPv6's `http://[::1]`. */
function closesOwnBracket(link: string): boolean {
  const last = link.at(-1);
  if (last !== ")" && last !== "]") return false;
  const opener = last === ")" ? "(" : "[";
  return count(link, opener) >= count(link, last);
}

/** The link one whitespace-separated word holds, or null. Sentence punctuation around it is not part
 *  of it, but a bracket the link itself opened is (see `closesOwnBracket`). */
function linkIn(word: string): string | null {
  let link = word.replace(OPENING, "");
  while (CLOSING.test(link) && !closesOwnBracket(link)) link = link.slice(0, -1);
  return /^https?:\/\/\S/i.test(link) ? link : null;
}

/** The first link in `text` is the submission; the rest of the text, without that word and with its
 *  whitespace collapsed, is the note. Any further link stays in the note, and `moreLinks` says so. */
export function parseLinkMessage(text: string): LinkMessage {
  const words = text.split(/\s+/).filter(Boolean);
  const links = words.map(linkIn);
  const first = links.findIndex((link) => link !== null);
  if (first === -1) return { error: "no_link" };
  const note = words.filter((_, index) => index !== first).join(" ");
  return { url: links[first]!, note: note || null, moreLinks: links.filter((link) => link !== null).length > 1 };
}
