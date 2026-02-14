import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = { staffProfileId: string; pin: string };

function pinToPassword(pin: string) {
  const p = pin.trim();
  // لو 4 أرقام → نخليه 8 أرقام (زي منطق المشروع)
  return p.length < 6 ? `${p}${p}` : p;
}

export async function POST(req: Request) {
  const token = req.headers.get("x-install-token") ?? "";
  if (!process.env.AHWA_INSTALL_TOKEN || token !== process.env.AHWA_INSTALL_TOKEN) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Body>;
  if (!body.staffProfileId || !body.pin) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "MISSING_ENV" }, { status: 500 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // نجيب auth_user_id من staff_profiles
  const { data: sp, error: spErr } = await admin
    .from("staff_profiles")
    .select("id, auth_user_id, cafe_id, base_role, is_active")
    .eq("id", body.staffProfileId)
    .maybeSingle();

  if (spErr) return NextResponse.json({ error: "DB_ERROR", details: spErr.message }, { status: 500 });
  if (!sp) return NextResponse.json({ error: "STAFF_NOT_FOUND" }, { status: 404 });
  if (!sp.is_active) return NextResponse.json({ error: "STAFF_INACTIVE" }, { status: 403 });
  if (!sp.auth_user_id) return NextResponse.json({ error: "NO_AUTH_USER" }, { status: 409 });

  const password = pinToPassword(body.pin);

  const { error: updErr } = await admin.auth.admin.updateUserById(sp.auth_user_id, { password });
  if (updErr) return NextResponse.json({ error: "AUTH_UPDATE_FAILED", details: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
