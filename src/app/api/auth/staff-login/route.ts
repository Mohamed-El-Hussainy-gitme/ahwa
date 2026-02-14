import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySecret } from "@/lib/auth/hash";
import { setStaffSession } from "@/lib/auth/session";

type StaffRow = {
  id: string;
  cafe_id: string;
  is_active: boolean;
  base_role: string;
  pin_hash: string | null;
  pin_version: number;
  failed_attempts: number;
  locked_until: string | null;
};

const Input = z.object({
  cafeSlug: z.string().min(1),
  name: z.string().min(1),
  pin: z.string().min(1),
});

function normalizeLoginName(raw: string) {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function escapeLikeExact(s: string) {
  // Prevent % and _ from acting as wildcards in ILIKE
  return s.replace(/[%_]/g, "\\$&");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const cafeSlug = parsed.data.cafeSlug.trim().toLowerCase();
  const loginName = normalizeLoginName(parsed.data.name);
  const pin = parsed.data.pin.trim();

  const admin = supabaseAdmin();

  const cafeRes = await admin
    .from("cafes")
    .select("id,is_active")
    // Case-insensitive exact match, without allowing wildcard patterns
    .ilike("slug", escapeLikeExact(cafeSlug))
    .maybeSingle();

  if (cafeRes.error || !cafeRes.data || !cafeRes.data.is_active) {
    return NextResponse.json({ ok: false, error: "CAFE_NOT_FOUND" }, { status: 404 });
  }

  const cafeId = String(cafeRes.data.id);

  const staffRes = await admin
    .from("staff_profiles")
    .select("id,cafe_id,is_active,base_role,pin_hash,pin_version,failed_attempts,locked_until")
    .eq("cafe_id", cafeId)
    .eq("login_name", loginName)
    .maybeSingle();

  const staff = staffRes.data as StaffRow | null;
  if (staffRes.error || !staff || !staff.is_active) {
    return NextResponse.json({ ok: false, error: "STAFF_NOT_FOUND" }, { status: 404 });
  }

  if (!staff.pin_hash) {
    // staff exists but has no PIN yet
    return NextResponse.json({ ok: false, error: "NEEDS_PIN" }, { status: 409 });
  }

  if (staff.locked_until && new Date(staff.locked_until).getTime() > Date.now()) {
    return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 423 });
  }

  const ok = verifySecret(pin, String(staff.pin_hash));
  if (!ok) {
    const nextAttempts = Number(staff.failed_attempts ?? 0) + 1;
    const locked_until = nextAttempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
    await admin
      .from("staff_profiles")
      .update({ failed_attempts: nextAttempts, locked_until, updated_at: new Date().toISOString() })
      .eq("id", staff.id);
    return NextResponse.json({ ok: false, error: "BAD_CREDENTIALS" }, { status: 401 });
  }

  // Determine active shift + shift role
  const isOwner = String(staff.base_role) === "owner";
  const shiftRes = await admin
    .from("shifts")
    .select("id")
    .eq("cafe_id", cafeId)
    .eq("is_open", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // If no open shift:
  // - allow login (so staff can be ready before opening a shift),
  // - but permissions inside the app will stay locked until a shift is opened & the staff is assigned.
  const shiftId: string | null = shiftRes.data?.id ? String(shiftRes.data.id) : null;

  let shiftRole: string | null = null;

  if (!isOwner && shiftId) {
    const asg = await admin
      .from("shift_assignments")
      .select("role")
      .eq("shift_id", String(shiftId))
      .eq("user_id", staff.id)
      .limit(1)
      .maybeSingle();

    if (!asg.data) {
      return NextResponse.json({ ok: false, error: "NOT_ASSIGNED" }, { status: 403 });
    }
    shiftRole = String(asg.data.role);
  }

  await admin
    .from("staff_profiles")
    .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", staff.id);

  try {
    const res = NextResponse.json({ ok: true });
    return await setStaffSession(res, {
      staffId: String(staff.id),
      cafeId,
      shiftId,
      shiftRole,
      pinVersion: Number(staff.pin_version ?? 0),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "SESSION_ERROR" }, { status: 500 });
  }
}
