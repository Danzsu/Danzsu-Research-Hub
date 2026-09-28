"use client";

import { useEffect } from "react";
import type { ReaderStore } from "@/lib/reader-store";

// WebMCP-style tools (`document.modelContext.registerTool`): let an in-browser AI agent mark items read
// and add to-dos for the signed-in reader. Does nothing in a browser without the API.

type ModelContext = {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

type MarkReadInput = { itemId: string; value: boolean };
export type MarkReadResult = { itemId: string; read: boolean } | { itemId: string; error: "not_on_this_page" };

/**
 * `mark_digest_item_read`'s own logic, pulled out so a test can call it without a DOM or an effect. The
 * reader store is scoped to the page's own items (spec: a Radar week, or a Library post), so an id
 * outside `itemIds` — another week's, or a `post:<id>` key — must not silently no-op and report success.
 */
export async function markItemRead(store: ReaderStore, itemIds: readonly string[], input: MarkReadInput): Promise<MarkReadResult> {
  const { itemId, value } = input;
  if (!itemIds.includes(itemId)) return { itemId, error: "not_on_this_page" };
  store.setFlag(itemId, "read", value);
  await store.settled();
  // After a failed write this is the rolled-back value, not the requested one.
  return { itemId, read: store.getSnapshot().states[itemId]?.read ?? false };
}

export function useModelContextTools(store: ReaderStore, itemIds: readonly string[]) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Record<string, unknown>) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    };
    register({
      name: "mark_digest_item_read",
      title: "Mark digest item read",
      description: "Mark one visible AI digest item as read for the signed-in reader. Only an item on the current page can be marked; any other id answers with a not_on_this_page error.",
      inputSchema: {
        type: "object",
        properties: { itemId: { type: "string" }, value: { type: "boolean" } },
        required: ["itemId", "value"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => markItemRead(store, itemIds, input as MarkReadInput),
    });
    register({
      name: "add_digest_todo",
      title: "Add digest to-do",
      description: "Add a short personal follow-up to the signed-in reader's digest list.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", minLength: 1, maxLength: 180 } },
        required: ["text"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const created = store.addTodo((input as { text: string }).text);
        await store.settled();
        return { created };
      },
    });
    return () => lifecycle.abort();
  }, [store, itemIds]);
}
