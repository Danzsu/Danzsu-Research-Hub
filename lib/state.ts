import { z } from "zod/v4";
import { TODO_TEXT_MAX } from "./pipeline/util.ts";
import { RATING_ID_MAX, ratingTargetId } from "./ratings.ts";

// The /api/state POST body. RLS already scopes every write to the caller; this only gets the shape right.
// Each field's schema carries the error code the route answers 400 with as its message.

const ITEM_ID_MAX = 120;

const ERRORS = ["missing_item", "invalid_item", "missing_text", "invalid_id", "invalid_target", "invalid_rating"] as const;
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
  z.object({
    action: z.literal("set_rating"),
    kind: z.enum(["item", "post", "repo"], { error: "invalid_target" }),
    id: z.string({ error: "invalid_target" }).trim().min(1, { error: "invalid_target" }).max(RATING_ID_MAX, { error: "invalid_target" }),
    // Only an explicit null clears: a missing value is a broken request, not "no rating".
    value: z.union([z.literal(-1), z.literal(1), z.literal(2), z.null()], { error: "invalid_rating" }),
  }),
]);

export type StateAction = z.infer<typeof actionSchema>;

const isKnownError = (message: string | undefined): message is (typeof ERRORS)[number] =>
  (ERRORS as readonly string[]).includes(message ?? "");

/** A validated state action, or the error code the route answers 400 with. */
export function parseStateAction(body: unknown): StateAction | { error: StateActionError } {
  const result = actionSchema.safeParse(body);
  if (result.success) return result.data.action === "set_rating" ? { ...result.data, id: ratingTargetId(result.data) } : result.data;
  const message = result.error.issues[0]?.message;
  return { error: isKnownError(message) ? message : "unknown_action" };
}
