import { parseId } from "./pipeline/util.ts";

// `Response.json`, not NextResponse: a route handler may return either, and this way `node --test` can load the file.
export const jsonError = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status });

export type ErrorAnswer = { status: number; error: string };

/** The answers the post routes' result maps share; each route adds its own. */
export const POST_ERRORS = {
  forbidden: { status: 403, error: "forbidden" },
  not_found: { status: 404, error: "not_found" },
  failed: { status: 500, error: "db_error" },
} satisfies Record<string, ErrorAnswer>;

/**
 * A `posts/[id]` route handler: 401 when `getReader` finds no session, 404 for an id no post can
 * have (the same answer as "no such post"), otherwise `handler` with the reader and the post id.
 */
export function postRoute<Reader>(
  getReader: () => Promise<Reader | null>,
  handler: (request: Request, target: { reader: Reader; postId: number }) => Promise<Response>,
) {
  return async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> => {
    const reader = await getReader();
    if (!reader) return jsonError(401, "unauthorized");
    const postId = parseId((await params).id);
    return postId ? handler(request, { reader, postId }) : jsonError(404, "not_found");
  };
}
