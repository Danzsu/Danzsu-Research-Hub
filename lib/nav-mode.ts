// The desktop sidebar's two widths: a full sidebar or a ~56px icon rail (spec 1.2). Read from the
// `nav` cookie by getNavMode() in lib/language.ts, so the server renders the right width with no flash.

export type NavMode = "full" | "rail";

/** The `nav` cookie's value. Anything but the exact "rail" — missing, stale, or garbled — means full. */
export function readNavMode(value: string | undefined): NavMode {
  return value === "rail" ? "rail" : "full";
}
