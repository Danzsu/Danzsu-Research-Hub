// Dev tool: runs one URL through the real pipeline against the configured Supabase project.
// Usage: npm run ingest -- <url>   (submits as the first invited user)
import { createClient } from "@supabase/supabase-js";
import { processSource } from "../lib/pipeline/ingest.ts";
import { detectSource, parseSubmittedUrl } from "../lib/pipeline/util.ts";

const url = parseSubmittedUrl(process.argv[2] ?? "");
if (!url) throw new Error("usage: npm run ingest -- <http(s) url>");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: users } = await db.auth.admin.listUsers();
const submitter = users?.users[0]?.id;
if (!submitter) throw new Error("no user to submit as: invite one first");

const { data: source, error } = await db
  .from("sources")
  .insert({ url: url.toString(), kind: detectSource(url), submitted_by: submitter })
  .select("id")
  .single();
if (error) throw error;
await processSource(db, source.id);

const { data: status } = await db.from("sources").select("status, error").eq("id", source.id).single();
const { data: post } = await db.from("posts").select("id, kind, source_site, meta, blocks").eq("source_id", source.id).maybeSingle();
console.log({
  source: source.id,
  ...status,
  post: post?.id,
  site: post?.source_site,
  meta: post?.meta,
  blocks: (post?.blocks as { type: string }[] | undefined)?.map((block) => block.type).join(","),
});
