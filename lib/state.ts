import { z } from "zod/v4";

// The /api/state POST body. RLS already scopes every write to the caller; this only gets the shape right.
// Each field's schema carries the error code the route answers 400 with as its message.

const ITEM_ID_MAX = 120;
const TODO_TEXT_MAX = 180;

const ERRORS = ["missing_item", "invalid_item", "missing_text", "invalid_id"] as const;
export type StateActionError = (typeof ERRORS)[number] | "unknown_action";

const itemIdOf = (id: string) => id.slice(0, ITEM_ID_MAX);
const itemId = z
  .string({ error: (issue) => (issue.input == null ? "missing_item" : "invalid_item") })
  .min(1, { error: "missing_item" })
  .transform(itemIdOf);
const optionalItemId = z
  .string({ error: "invalid_item" })
  .nullish()
  .transform((id) => (id ? itemIdOf(id) : null));
// Anything but `true` counts as false: a malformed flag never fails the request.
const flag = z.boolean().catch(false);
const todoId = z.int({ error: "invalid_id" });

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["set_read", "set_saved"]), itemId, value: flag }),
  z.object({
    action: z.literal("add_todo"),
    text: z.string({ error: "missing_text" }).trim().min(1, { error: "missing_text" }).transform((text) => text.slice(0, TODO_TEXT_MAX)),
    itemId: optionalItemId,
  }),
  z.object({ action: z.literal("set_todo"), id: todoId, value: flag }),
  z.object({ action: z.literal("delete_todo"), id: todoId }),
]);

export type StateAction = z.infer<typeof actionSchema>;

const isKnownError = (message: string | undefined): message is (typeof ERRORS)[number] =>
  (ERRORS as readonly string[]).includes(message ?? "");

/** A validated state action, or the error code the route answers 400 with. */
export function parseStateAction(body: unknown): StateAction | { error: StateActionError } {
  const result = actionSchema.safeParse(body);
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message;
  return { error: isKnownError(message) ? message : "unknown_action" };
}
