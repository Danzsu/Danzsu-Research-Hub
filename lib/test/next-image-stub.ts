import { createElement } from "react";

// next/image needs a running Next.js app (its optimizer); offline, a plain <img> with the same source stands in.
export default function Image({ src, alt, width, height, className }: { src: string; alt: string; width?: number; height?: number; className?: string }) {
  return createElement("img", { src, alt, width, height, className });
}
