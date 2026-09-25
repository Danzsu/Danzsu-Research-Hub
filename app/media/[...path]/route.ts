import { MEDIA_BUCKET, MEDIA_TYPES, isMediaKey } from "@/lib/media";
import { createAdminClient, getViewer } from "@/lib/supabase/server";

// Mirrored images are for signed-in readers only. Keys are content-addressed,
// so a response never changes: cache it for a year, privately.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await getViewer())) return new Response("unauthorized", { status: 401 });
  const key = (await params).path.join("/");
  if (!isMediaKey(key)) return new Response("not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).download(key);
  if (error) console.warn(`media ${key}: ${error.message}`);
  if (error || !data) return new Response("not found", { status: 404 });

  const extension = key.slice(key.lastIndexOf(".") + 1) as keyof typeof MEDIA_TYPES;
  return new Response(await data.arrayBuffer(), {
    headers: {
      "content-type": MEDIA_TYPES[extension],
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
