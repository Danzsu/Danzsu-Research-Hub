/** A `#tag` chip. The border follows the text colour, so it works on paper, cream and ink cards alike. */
export function Tag({ tag }: { tag: string }) {
  return <span className="border border-current/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>;
}
