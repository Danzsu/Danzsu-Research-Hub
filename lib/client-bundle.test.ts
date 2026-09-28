import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { aliasedFile, relativeFile } from "./test/tsx-hooks.ts";

// zod stays out of the browser bundle (spec 3.1–3.2). The walk starts at every file under app/ whose
// first statement is "use client", and follows each import that survives compilation (a type-only one
// doesn't) through app/ and lib/ alike: a server file that a client file imports ships to the browser
// too, as post-blocks.tsx does. It doesn't enter packages; a zod import anywhere on the way fails, and
// the message names the whole chain from its root.

const repoRoot = new URL("../", import.meta.url);

function sourceFiles(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, dir));
    return /\.tsx?$/.test(entry.name) ? [new URL(entry.name, dir).href] : [];
  });
}

const parse = (href: string) => ts.createSourceFile(href, readFileSync(new URL(href), "utf8"), ts.ScriptTarget.Latest);

function isClientRoot(file: ts.SourceFile): boolean {
  const first = file.statements[0];
  return first !== undefined && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use client";
}

/** The specifiers of `file`'s imports and re-exports that compilation keeps. */
function valueImports(file: ts.SourceFile): string[] {
  return file.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const named = clause?.namedBindings;
      const typesOnly =
        clause?.isTypeOnly ||
        (clause && !clause.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly));
      return typesOnly ? [] : [(statement.moduleSpecifier as ts.StringLiteral).text];
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      return [(statement.moduleSpecifier as ts.StringLiteral).text];
    }
    return [];
  });
}

/** The repo's .ts/.tsx file an `@/…`, `./…` or `../…` import names; undefined for a package. */
function resolveImport(specifier: string, from: string): string | undefined {
  const file = specifier.startsWith("@/") ? aliasedFile(specifier) : /^\.\.?\//.test(specifier) ? relativeFile(specifier, from) : undefined;
  return file && /\.tsx?$/.test(file) ? file : undefined;
}

const shown = (href: string) => decodeURIComponent(href.slice(repoRoot.href.length));
const roots = sourceFiles(new URL("app/", repoRoot)).filter((href) => isClientRoot(parse(href)));
const reached = new Set<string>();
const zodChains: string[] = [];

function visit(href: string, chain: string[]): void {
  if (reached.has(href)) return;
  reached.add(href);
  for (const specifier of valueImports(parse(href))) {
    if (specifier === "zod" || specifier.startsWith("zod/")) zodChains.push([...chain, href].map(shown).concat(specifier).join(" → "));
    const next = resolveImport(specifier, href);
    if (next) visit(next, [...chain, href]);
  }
}
for (const root of roots) visit(root, []);

// Not vacuous: a walk that resolved nothing (a broken alias, say) would find no zod and pass.
test("the client walk starts at every use-client file and reaches the modules zod came in through", () => {
  assert.ok(roots.length >= 15, `only ${roots.length} "use client" roots under app/`);
  for (const file of ["lib/reader-store.ts", "lib/post-view.ts", "app/components/post-blocks.tsx"]) {
    assert.ok(reached.has(new URL(file, repoRoot).href), `the walk never reached ${file}`);
  }
});

// Spec 3.2. Its mutation probe: reader-store.ts importing TODO_TEXT_MAX from ./state.ts again fails here
// with "app/(app)/library/[id]/mark-post-read.tsx → lib/reader-store.ts → lib/state.ts → zod/v4".
test("no module a client component reaches imports zod", () => {
  assert.deepEqual(zodChains, []);
});
