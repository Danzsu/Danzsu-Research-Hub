import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { resetRoute, routeStub, signedIn } from "./route-hooks.ts";

type AuthMethod = "signInWithOAuth" | "exchangeCodeForSession" | "verifyOtp" | "signInWithOtp" | "signOut";
type AuthAnswer = { data?: unknown; error: { message: string } | null };

const SUCCESS: Record<AuthMethod, AuthAnswer> = {
  signInWithOAuth: { data: { provider: "google", url: "https://ref.supabase.test/auth/v1/authorize?provider=google" }, error: null },
  exchangeCodeForSession: { data: {}, error: null },
  verifyOtp: { data: {}, error: null },
  signInWithOtp: { data: {}, error: null },
  signOut: { error: null },
};

/** The auth routes' Supabase client: every auth call lands in the returned log with its argument, and
 *  answers `answers[method]`, or success. Route tests' createClient() hands out the reader's db, so this
 *  sets one up although these routes run signed out. */
export function fakeAuth(answers: Partial<Record<AuthMethod, AuthAnswer>> = {}): [AuthMethod, unknown][] {
  resetRoute();
  const calls: [AuthMethod, unknown][] = [];
  const method = (name: AuthMethod) => async (arg: unknown) => {
    calls.push([name, arg]);
    return answers[name] ?? SUCCESS[name];
  };
  const auth = Object.fromEntries((Object.keys(SUCCESS) as AuthMethod[]).map((name) => [name, method(name)]));
  routeStub.reader = signedIn({ auth } as unknown as SupabaseClient, "visitor");
  return calls;
}

/** A GET with a query, or a POSTed form, as the auth routes read it: a Request with Next's `nextUrl`. */
export function authRequest(pathAndQuery: string, form?: Record<string, string>): NextRequest {
  const url = `http://localhost${pathAndQuery}`;
  const request = form ? new Request(url, { method: "POST", body: new URLSearchParams(form) }) : new Request(url);
  return Object.assign(request, { nextUrl: new URL(url) }) as unknown as NextRequest;
}
