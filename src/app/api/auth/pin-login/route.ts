import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setStaffSession } from "@/lib/auth/session";
import { verifySecret } from "@/lib/auth/hash";

const Input = z.object({
  cafeSlug: z.string().min(1),
  name: z.string().min(1), // اسم الموظف
  pin: z.string().min(1),
});

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
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
  const loginName = normalizeName(parsed.data.name);
  const pin = parsed.data.pin.trim();

  const admin = supabaseAdmin();

  // 1) cafe
  const cafeRes = await admin
    .from("cafes")
    .select("id,is_active")
    .ilike("slug", escapeLikeExact(cafeSlug))
    .maybeSingle();

  if (cafeRes.error || !cafeRes.data || !cafeRes.data.is_active) {
    return NextResponse.json({ ok: false, error: "CAFE_NOT_FOUND" }, { status: 404 });
  }
  const cafeId = cafeRes.data.id as string;

  // 2) verify staff by DB hash (NO supabase auth)
  const staffRes = await admin
    .from("staff_profiles")
    .select("id,cafe_id,is_active,base_role,login_name,name,pin_hash")
    .eq("cafe_id", cafeId)
    .eq("is_active", true)
    .eq("login_name", loginName)
    // pin check done by rpc (below) OR via a view/function
    .maybeSingle();

  if (staffRes.error || !staffRes.data) {
    return NextResponse.json({ ok: false, error: "BAD_CREDENTIALS" }, { status: 401 });
  }

  const staffId = staffRes.data.id as string;

  // 3) verify PIN (server-side to avoid DB function coupling)
  const pinHash = (staffRes.data as unknown as { pin_hash?: string | null }).pin_hash;
  if (!pinHash) {
    return NextResponse.json({ ok: false, error: "NEEDS_PIN" }, { status: 409 });
  }

  const ok = await verifySecret(pin, String(pinHash));
  if (!ok) {
    return NextResponse.json({ ok: false, error: "BAD_CREDENTIALS" }, { status: 401 });
  }

  // 4) shift binding:
  // - if there is NO open shift: allow login (app will show "لا توجد وردية مفتوحة" and lock permissions)
  // - if there IS an open shift: require that the staff is assigned to that shift
  let shiftId: string | null = null;
  let shiftRole: string | null = null;

  const shiftRes = await admin
    .from("shifts")
    .select("id")
    .eq("cafe_id", cafeId)
    .eq("is_open", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftRes.data?.id) {
    shiftId = shiftRes.data.id as string;

    const asgRes = await admin
      .from("shift_assignments")
      .select("role")
      .eq("cafe_id", cafeId)
      .eq("shift_id", shiftId)
      .eq("user_id", staffId)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!asgRes.data?.role) {
      return NextResponse.json({ ok: false, error: "NOT_ASSIGNED" }, { status: 403 });
    }
    shiftRole = asgRes.data.role as string;
  }

  // 5) set cookie session
  try {
    const res = NextResponse.json({ ok: true, staffId, shiftId, shiftRole });
    return await setStaffSession(res, {
      cafeId,
      staffId,
      shiftId,
      shiftRole,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "SESSION_ERROR" }, { status: 500 });
  }
}
