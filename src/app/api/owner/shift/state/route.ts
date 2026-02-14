import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "@/app/api/owner/staff/_auth";

export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = supabaseAdmin();

  const { data: shift, error: shiftErr } = await admin
    .from("shifts")
    .select("id,cafe_id,kind,is_open,started_at,opened_by,ended_at,ended_by,supervisor_user_id")
    .eq("cafe_id", auth.cafeId)
    .eq("is_open", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftErr) return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  if (!shift) return NextResponse.json({ ok: true, shift: null, assignments: [] });

  const { data: assignments, error: aErr } = await admin
    .from("shift_assignments")
    .select("id, user_id, role, assigned_at, assigned_by")
    .eq("cafe_id", auth.cafeId)
    .eq("shift_id", shift.id);

  if (aErr) return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });

  return NextResponse.json({ ok: true, shift, assignments: assignments ?? [] });
}
