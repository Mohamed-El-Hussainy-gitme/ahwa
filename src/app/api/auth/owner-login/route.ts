import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/auth/pin";
import { verifySecret } from "@/lib/auth/hash";
import { setPartnerSession } from "@/lib/auth/session";

const Input = z.object({
  phone: z.string().min(1),
  pin: z.string().min(1),
});

function normalizePartnerPhone(phoneRaw: string) {
  const p = normalizePhone(phoneRaw);
  return p.startsWith("+") ? p.slice(1) : p;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  // Legacy endpoint: previously used Supabase phone auth + owner in staff_profiles.
  // Now it authenticates against partners table (phone + password_hash).
  const phone = normalizePartnerPhone(parsed.data.phone);
  const password = parsed.data.pin.trim();

  const admin = supabaseAdmin();

  const partnerRes = await admin
    .from("partners")
    .select("id,cafe_id,is_active,password_hash,failed_attempts,locked_until")
    .eq("phone", phone)
    .maybeSingle();

  const partner = partnerRes.data;
  if (partnerRes.error || !partner || !partner.is_active) {
    return NextResponse.json({ ok: false, error: "PARTNER_NOT_FOUND" }, { status: 404 });
  }

  if (partner.locked_until && new Date(partner.locked_until).getTime() > Date.now()) {
    return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 423 });
  }

  const ok = verifySecret(password, partner.password_hash);
  if (!ok) {
    const nextAttempts = (partner.failed_attempts ?? 0) + 1;
    const locked_until =
      nextAttempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;

    await admin
      .from("partners")
      .update({
        failed_attempts: nextAttempts,
        locked_until,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);

    return NextResponse.json({ ok: false, error: "BAD_CREDENTIALS" }, { status: 401 });
  }

  const cafeRes = await admin.from("cafes").select("is_active").eq("id", partner.cafe_id).maybeSingle();
  if (cafeRes.error || !cafeRes.data || !cafeRes.data.is_active) {
    return NextResponse.json({ ok: false, error: "CAFE_NOT_ACTIVE" }, { status: 403 });
  }

  await admin
    .from("partners")
    .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", partner.id);

  try {
    const res = NextResponse.json({ ok: true });
    return await setPartnerSession(res, { partnerId: partner.id, cafeId: partner.cafe_id });
  } catch {
    return NextResponse.json({ ok: false, error: "SESSION_ERROR" }, { status: 500 });
  }
}
