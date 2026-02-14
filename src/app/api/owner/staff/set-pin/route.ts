import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/auth/pin";
import { hashSecret } from "@/lib/auth/hash";
import { requireOwner } from "../_auth";

const BodySchema = z.object({
  userId: z.string().uuid(),
  pin: z.string().trim().min(4),
});

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json({ ok: false, error: owner.error }, { status: owner.status });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const { userId, pin } = parsed.data;
  const admin = supabaseAdmin();
  const password = pinToPassword(pin);
  const pinHash = hashSecret(pin);

  const prof = await admin
    .from("staff_profiles")
    .select("id,base_role,auth_user_id,pin_version")
    .eq("id", userId)
    .eq("cafe_id", owner.cafeId)
    .maybeSingle();

  if (prof.error || !prof.data) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  if (prof.data.base_role === "owner") {
    return NextResponse.json({ ok: false, error: "CANNOT_RESET_OWNER_PIN" }, { status: 400 });
  }
  if (!prof.data.auth_user_id) {
    return NextResponse.json({ ok: false, error: "NEEDS_PROVISION" }, { status: 409 });
  }

  const updated = await admin.auth.admin.updateUserById(String(prof.data.auth_user_id), { password });
  if (updated.error) {
    return NextResponse.json({ ok: false, error: "AUTH_UPDATE_FAILED", auth: updated.error }, { status: 400 });
  }

  // Keep a DB-side PIN hash as well (used by /api/auth/staff-login name+PIN).
  // Also bump pin_version so active sessions get invalidated.
  const nextPinVersion = Number(prof.data.pin_version ?? 0) + 1;
  const updProfile = await admin
    .from("staff_profiles")
    .update({
      pin_hash: pinHash,
      pin_version: nextPinVersion,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("cafe_id", owner.cafeId);

  if (updProfile.error) {
    return NextResponse.json({ ok: false, error: "PROFILE_UPDATE_FAILED", details: updProfile.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
