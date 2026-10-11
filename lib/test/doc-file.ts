import { readFileSync } from "node:fs";

/** A file under .claude/docs/, CRLF-normalized. Throws ENOENT when the file isn't there: a moved doc must
 *  fail its test, never pass on an empty read. */
export const docFile = (name: string): string => readFileSync(new URL(`../../.claude/docs/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
