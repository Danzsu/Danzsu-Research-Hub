import Image from "next/image";

/** The flame-diamond logo beside the NEON NEWS RADAR wordmark: the app icon (app/icon.png, served at /icon.png).
 *  Decorative, so it has no alt: the wordmark or the link around it names the site. */
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return <Image src="/icon.png" alt="" width={64} height={64} className={`shrink-0 ${className}`} />;
}
