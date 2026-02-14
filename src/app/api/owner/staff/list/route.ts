import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "../_auth";

export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("staff_profiles")
    .select("id, name, display_name, login_name, base_role, is_active, created_at")
    .eq("cafe_id", auth.cafeId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, staff: data ?? [] });
}
