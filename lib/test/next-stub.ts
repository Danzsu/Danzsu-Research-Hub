// Stands in for both `next/link` and `next/navigation` in component tests (see tsx-hooks.ts):
// the real modules need a mounted app router.

import { createElement, type ReactNode } from "react";

/** `next/link` as the plain anchor it renders to. */
export default function Link({ href, children, ...rest }: { href: string; children?: ReactNode }) {
  return createElement("a", { href, ...rest }, children);
}

/** `next/navigation`'s router, inert: a static render never navigates. */
export const useRouter = () => ({ push() {}, refresh() {} });

/** What the stubs answer: `usePathname` "/" and `useLinkStatus` not pending, unless a test sets them,
 *  like `routeStub` in route-hooks.ts. Reset them after. */
export const navigationStub = { pathname: "/", linkPending: false };

/** `next/link`'s `useLinkStatus`: the pending navigation of the Link it sits in. */
export const useLinkStatus = () => ({ pending: navigationStub.linkPending });

/** The navigations and language-toggle.tsx read this to mark the active link. */
export const usePathname = () => navigationStub.pathname;
