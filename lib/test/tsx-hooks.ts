// Node module hooks registered by render.ts (they run on Node's loader thread). They do the three
// things a bundler would: resolve `@/` like tsconfig's paths, compile .tsx with the project's own
// TypeScript, and swap the Next.js modules that need a running app for next-stub.ts.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type Resolved = { url: string; shortCircuit?: boolean };
type Loaded = { format?: string | null; source?: unknown; shortCircuit?: boolean };

const root = new URL("../../", import.meta.url);
const STUBBED = new Set(["next/link", "next/navigation"]);
const stub = new URL("./next-stub.ts", import.meta.url).href;

/** `@/lib/blocks` → the file it names, trying the extensions an extensionless import can mean. */
function aliasedFile(specifier: string): string | undefined {
  const base = new URL(specifier.slice(2), root).href;
  return [".ts", ".tsx", "", "/index.ts"]
    .map((suffix) => base + suffix)
    .find((url) => !url.endsWith("/") && existsSync(fileURLToPath(url)));
}

export async function resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => Promise<Resolved>): Promise<Resolved> {
  if (STUBBED.has(specifier)) return { url: stub, shortCircuit: true };
  const aliased = specifier.startsWith("@/") ? aliasedFile(specifier) : undefined;
  return aliased ? { url: aliased, shortCircuit: true } : nextResolve(specifier, context);
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
