import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "../_auth";

const BodySchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
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

  const { userId, isActive } = parsed.data;
  const admin = supabaseAdmin();

  // Prevent killing the owner account by mistake
  const current = await admin
    .from("staff_profiles")
    .select("id,base_role,auth_user_id")
    .eq("id", userId)
    .eq("cafe_id", owner.cafeId)
    .maybeSingle();

  if (!current.data) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  if (current.data.base_role === "owner") {
    return NextResponse.json({ ok: false, error: "CANNOT_DISABLE_OWNER" }, { status: 400 });
  }

  const upd = await admin
    .from("staff_profiles")
    .update({ is_active: isActive })
    .eq("id", userId)
    .eq("cafe_id", owner.cafeId);

  if (upd.error) {
    return NextResponse.json({ ok: false, error: "UPDATE_FAILED", details: upd.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
