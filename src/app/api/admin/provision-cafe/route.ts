import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pinToPassword } from "@/lib/auth/pin";

/**
 * Admin-only provisioning endpoint.
 * الهدف: منع أي كافيه من عمل signup بنفسه.
 * أنت فقط (وقت البيع/التركيب) تنشئ الكافيه + الأونر + حساب Auth.
 */

const BodySchema = z.object({
  cafeSlug: z.string().trim().min(2),
  cafeName: z.string().trim().min(1).optional(),
  ownerName: z.string().trim().min(1),
  ownerPhone: z.string().trim().min(6),
  ownerPin: z.string().trim().min(4),
});

function assertInstallToken(req: Request) {
  const expected = process.env.AHWA_INSTALL_TOKEN;
  // لو ما حطيتش توكن، نخلي الإندبوينت مقفول بشكل صريح
  if (!expected) {
    return { ok: false as const, error: "INSTALL_TOKEN_NOT_SET" };
  }
  const got = req.headers.get("x-install-token") ?? "";
  if (got !== expected) {
    return { ok: false as const, error: "FORBIDDEN" };
  }
  return { ok: true as const };
}

export async function POST(req: Request) {
  const token = assertInstallToken(req);
  if (!token.ok) {
    return NextResponse.json({ ok: false, error: token.error }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const { cafeSlug, cafeName, ownerName, ownerPhone, ownerPin } = parsed.data;
  const admin = supabaseAdmin();

  // 1) upsert cafe
  const cafeUpsert = await admin
    .from("cafes")
    .upsert(
      {
        slug: cafeSlug,
        name: cafeName ?? cafeSlug,
        is_active: true,
      },
      { onConflict: "slug" }
    )
    .select("id, slug")
    .single();

  if (cafeUpsert.error) {
    return NextResponse.json({ ok: false, error: "CAFE_UPSERT_FAILED", details: cafeUpsert.error }, { status: 500 });
  }

  const cafeId: string = cafeUpsert.data.id;

  // 2) create / ensure auth user (phone+password)
  const password = pinToPassword(ownerPin);
  const created = await admin.auth.admin.createUser({
    phone: ownerPhone,
    password,
    phone_confirm: true,
    user_metadata: { cafeSlug, role: "owner" },
  });

  if (created.error) {
    // لو رقم التليفون موجود بالفعل، نبلغك بشكل واضح
    return NextResponse.json(
      { ok: false, error: "AUTH_CREATE_FAILED", auth: { status: created.error.status, message: created.error.message, code: created.error.code } },
      { status: 400 }
    );
  }

  const authUserId = created.data.user?.id;
  if (!authUserId) {
    return NextResponse.json({ ok: false, error: "AUTH_USER_ID_MISSING" }, { status: 500 });
  }

  // 3) upsert staff profile (owner)
  const profUpsert = await admin
    .from("staff_profiles")
    .upsert(
      {
        cafe_id: cafeId,
        phone: ownerPhone,
        name: ownerName,
        base_role: "owner",
        is_active: true,
        auth_user_id: authUserId,
      },
      { onConflict: "cafe_id,phone" }
    )
    .select("id, cafe_id, phone, base_role, auth_user_id")
    .single();

  if (profUpsert.error) {
    return NextResponse.json({ ok: false, error: "PROFILE_UPSERT_FAILED", details: profUpsert.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cafe: cafeUpsert.data, owner: profUpsert.data });
}
