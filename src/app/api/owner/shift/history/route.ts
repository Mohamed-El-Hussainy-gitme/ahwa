import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "@/app/api/owner/staff/_auth";

export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("shifts")
    .select("id, kind, is_open, started_at, ended_at, supervisor_user_id")
    .eq("cafe_id", auth.cafeId)
    .order("started_at", { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json({ ok: false, error: "SHIFT_HISTORY_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, shifts: data ?? [] });
}
