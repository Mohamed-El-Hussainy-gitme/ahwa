import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/auth/pin";
import { hashSecret } from "@/lib/auth/hash";
import { requireOwner } from "../_auth";
import { randomInt } from "crypto";

const BodySchema = z.object({
  name: z.string().trim().min(2),
  pin: z.string().trim().min(4),
});

function normalizeLoginName(raw: string) {
  return (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function generateUniqueLoginPhone(admin: ReturnType<typeof supabaseAdmin>) {
  // We use a fake-but-E.164-shaped phone; the employee never sees it.
  // If you prefer a different prefix, change it here.
  for (let i = 0; i < 10; i++) {
    const candidate = "+201" + String(randomInt(100000000, 999999999));
    const exists = await admin.from("staff_profiles").select("id").eq("login_phone", candidate).maybeSingle();
    if (!exists.data) return candidate;
  }
  throw new Error("FAILED_TO_GENERATE_LOGIN_PHONE");
}

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const { name, pin } = parsed.data;
  const loginName = normalizeLoginName(name);
  const password = pinToPassword(pin);
  const pinHash = hashSecret(pin);

  const admin = supabaseAdmin();

  // Reject duplicates within the cafe
  const dup = await admin.from("staff_profiles").select("id").eq("cafe_id", owner.cafeId).eq("login_name", loginName).maybeSingle();
  if (dup.data) {
    return NextResponse.json({ ok: false, error: "DUPLICATE_NAME" }, { status: 409 });
  }

  const loginPhone = await generateUniqueLoginPhone(admin);

  // Create Auth user (phone+password) – the phone is internal.
  const created = await admin.auth.admin.createUser({
    phone: loginPhone,
    password,
    phone_confirm: true,
    user_metadata: { cafeId: owner.cafeId, role: "staff", displayName: name },
  });

  if (created.error || !created.data.user?.id) {
    return NextResponse.json({ ok: false, error: "AUTH_CREATE_FAILED", auth: created.error }, { status: 400 });
  }

  const authUserId = created.data.user.id;

  // Insert staff profile
  const ins = await admin
    .from("staff_profiles")
    .insert({
      cafe_id: owner.cafeId,
      name,
      login_name: loginName,
      login_phone: loginPhone,
      base_role: "staff",
      is_active: true,
      auth_user_id: authUserId,
      // PIN (for name+PIN login)
      pin_hash: pinHash,
      pin_version: 1,
      failed_attempts: 0,
      locked_until: null,
      // legacy columns (some schemas still require them)
      username: loginName,
      display_name: name,
    })
    .select("id,name,base_role,is_active")
    .single();

  if (ins.error) {
    // Best-effort cleanup: delete auth user to avoid orphan
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {}
    return NextResponse.json({ ok: false, error: "PROFILE_CREATE_FAILED", details: ins.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, staff: ins.data });
}
