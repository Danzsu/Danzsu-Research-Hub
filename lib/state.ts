import { z } from "zod/v4";

// The /api/state POST body. RLS already scopes every write to the caller; this only gets the shape right.

const ITEM_ID_MAX = 120;
const TODO_TEXT_MAX = 180;

const itemId = z.string().min(1).transform((id) => id.slice(0, ITEM_ID_MAX));
// Anything but `true` counts as false: a malformed flag never fails the request.
const flag = z.boolean().catch(false);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["set_read", "set_saved"]), itemId, value: flag }),
  z.object({
    action: z.literal("add_todo"),
    text: z.string().trim().min(1).transform((text) => text.slice(0, TODO_TEXT_MAX)),
    itemId: z.string().nullish().transform((id) => (id ? id.slice(0, ITEM_ID_MAX) : null)),
  }),
  z.object({ action: z.literal("set_todo"), id: z.int(), value: flag }),
  z.object({ action: z.literal("delete_todo"), id: z.int() }),
]);

export type StateAction = z.infer<typeof actionSchema>;
export type StateActionError = "missing_item" | "missing_text" | "invalid_id" | "unknown_action";

const ERROR_BY_FIELD: Record<string, StateActionError> = { itemId: "missing_item", text: "missing_text", id: "invalid_id" };

/** A validated state action, or the error code the route answers 400 with. */
export function parseStateAction(body: unknown): StateAction | { error: StateActionError } {
  const result = actionSchema.safeParse(body);
  if (result.success) return result.data;
  return { error: ERROR_BY_FIELD[String(result.error.issues[0]?.path[0])] ?? "unknown_action" };
}
