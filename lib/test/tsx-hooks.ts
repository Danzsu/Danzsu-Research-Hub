// Node module hooks registered by render.ts and route-hooks.ts (they run on Node's loader thread).
// They do the three things a bundler would: resolve `@/` and extensionless relative imports like
// tsconfig's paths, compile .tsx with the project's own TypeScript, and swap the modules that need a
// running Next.js app for next-stub.ts (components) or route-hooks.ts (route handlers).

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type Resolved = { url: string; shortCircuit?: boolean };
type Loaded = { format?: string | null; source?: unknown; shortCircuit?: boolean };

const root = new URL("../../", import.meta.url);
const here = (file: string) => new URL(file, import.meta.url).href;
/** Modules that need a running Next.js app, and what stands in for them. */
const STUBS = new Map([
  ["next/link", here("./next-stub.ts")],
  ["next/navigation", here("./next-stub.ts")],
  ["next/server", here("./route-hooks.ts")],
  ["@/lib/supabase/server", here("./route-hooks.ts")],
  ["server-only", "data:text/javascript,"],
]);

const isFile = (url: string) => statSync(fileURLToPath(url), { throwIfNoEntry: false })?.isFile() ?? false;

/** A base URL → the file it names, trying the extensions an extensionless import can mean. */
const withExtension = (base: string) => ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].map((suffix) => base + suffix).find(isFile);

/** `@/lib/blocks` → the file it names. */
const aliasedFile = (specifier: string) => withExtension(new URL(specifier.slice(2), root).href);

/** `./tag` or `../foo`, no extension → the file it names, resolved against the importing module. */
const relativeFile = (specifier: string, parentURL: string) => withExtension(new URL(specifier, parentURL).href);

export async function resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => Promise<Resolved>): Promise<Resolved> {
  const stub = STUBS.get(specifier);
  if (stub) return { url: stub, shortCircuit: true };
  const parentURL = (context as { parentURL?: string }).parentURL;
  const resolved = specifier.startsWith("@/")
    ? aliasedFile(specifier)
    : /^\.\.?\//.test(specifier) && !/\.[^./]+$/.test(specifier) && parentURL
      ? relativeFile(specifier, parentURL)
      : undefined;
  return resolved ? { url: resolved, shortCircuit: true } : nextResolve(specifier, context);
}

export async function load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => Promise<Loaded>): Promise<Loaded> {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  const path = fileURLToPath(url);
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
