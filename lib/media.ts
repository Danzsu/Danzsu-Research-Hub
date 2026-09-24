// Pure: shared by the image pipeline, the /media route and the renderer (also client-side).
export const MEDIA_BUCKET = "media";
export const MEDIA_TYPES = { avif: "image/avif", webp: "image/webp", svg: "image/svg+xml" } as const;
export type MediaFormat = keyof typeof MEDIA_TYPES;

export const variantPath = (key: string, width: number, format: MediaFormat) => `${key}-${width}.${format}`;

export const isMediaKey = (key: string) => /^\d+\/[0-9a-f]{16}-\d+\.(avif|webp|svg)$/.test(key);

export const mediaUrl = (key: string, width: number, format: MediaFormat) => `/media/${variantPath(key, width, format)}`;
