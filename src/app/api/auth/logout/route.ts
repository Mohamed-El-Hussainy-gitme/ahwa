import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  return await clearSession(res);
}
