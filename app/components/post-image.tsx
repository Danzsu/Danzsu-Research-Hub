"use client";

import { useState } from "react";

/**
 * The post image itself: a blurred placeholder sits behind it until it has loaded, then this layer
 * is removed — never left as the image's own permanent CSS background — so a transparent PNG/AVIF
 * (arXiv, GitHub figures) never shows blur bleeding through a transparent pixel afterwards (spec
 * 1.4.12). The only stateful piece of the post renderer, split out so post-blocks.tsx can stay
 * hook-free and keep rendering inside a Server Component (see its own header comment).
 * A cached image can finish loading before hydration, when onLoad has no listener yet, so the ref
 * callback also checks `complete`; the img is `relative` so it paints above the placeholder layer.
 */
export function PostImage({
  src,
  srcSet,
  sizes,
  alt,
  width,
  height,
  priority,
  placeholder,
}: {
  src: string;
  srcSet: string;
  sizes: string;
  alt: string;
  width?: number;
  height?: number;
  priority: boolean;
  placeholder?: string;
}) {
  const [settled, setSettled] = useState(false);
  return (
    <span className="relative block">
      {placeholder && !settled && (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${placeholder}")` }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- variants are pre-encoded; next/image would re-optimize them */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setSettled(true);
        }}
        onLoad={() => setSettled(true)}
        onError={() => setSettled(true)}
        // No w-full: images.ts never enlarges, so a small mirror keeps its size instead of being stretched blurry.
        className="relative mx-auto block h-auto max-h-[80dvh] max-w-full object-contain"
      />
    </span>
  );
}
