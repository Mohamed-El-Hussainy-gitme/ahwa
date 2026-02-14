import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "@/app/api/owner/staff/_auth";

export async function POST(req: Request) {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { shiftId } = (await req.json()) as { shiftId: string };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("shifts")
    .update({
      is_open: false,
      ended_at: new Date().toISOString(),
      ended_by: auth.ownerStaffId,
    })
    .eq("cafe_id", auth.cafeId)
    .eq("id", shiftId);

  if (error) return NextResponse.json({ ok: false, error: "SHIFT_CLOSE_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
