import { NextResponse } from "next/server";

export const jsonError = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });
