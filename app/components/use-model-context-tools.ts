"use client";

import { useEffect } from "react";
import type { ReaderStore } from "@/lib/reader-store";

// WebMCP-style tools (`document.modelContext.registerTool`): let an in-browser AI agent mark items read
// and add to-dos for the signed-in reader. Does nothing in a browser without the API.

type ModelContext = {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

export function useModelContextTools(store: ReaderStore) {
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
      description: "Mark one visible AI digest item as read for the signed-in reader.",
      inputSchema: {
        type: "object",
        properties: { itemId: { type: "string" }, value: { type: "boolean" } },
        required: ["itemId", "value"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const { itemId, value } = input as { itemId: string; value: boolean };
        store.setFlag(itemId, "read", value);
        await store.settled();
        // After a failed write this is the rolled-back value, not the requested one.
        return { itemId, read: store.getSnapshot().states[itemId]?.read ?? false };
      },
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
  }, [store]);
}
