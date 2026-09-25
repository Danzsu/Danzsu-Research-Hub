// Stands in for both `next/link` and `next/navigation` in component tests (see tsx-hooks.ts):
// the real modules need a mounted app router.

import { createElement, type ReactNode } from "react";

/** `next/link` as the plain anchor it renders to. */
export default function Link({ href, children, ...rest }: { href: string; children?: ReactNode }) {
  return createElement("a", { href, ...rest }, children);
}

/** `next/navigation`'s router, inert: a static render never navigates. */
export const useRouter = () => ({ push() {}, refresh() {} });

/** desktop-nav.tsx and language-toggle.tsx read this to highlight the active link; a static render has no real route, so every test sees "/". */
export const usePathname = () => "/";
