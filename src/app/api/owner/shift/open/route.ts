import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "@/app/api/owner/staff/_auth";

type ShiftKind = "morning" | "evening";

type Body = {
  kind: ShiftKind;
  supervisorUserId?: string | null;
  assignments: Array<{ userId: string; role: string }>;
};

const ALLOWED_ROLES: ReadonlySet<string> = new Set(["supervisor", "waiter", "barista", "shisha"]);


export async function POST(req: Request) {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = (await req.json()) as Body;
  const admin = supabaseAdmin();

  // اقفل أي وردية مفتوحة قديمة (احتياطي)
  await admin
    .from("shifts")
    .update({
      is_open: false,
      ended_at: new Date().toISOString(),
      ended_by: auth.ownerStaffId,
    })
    .eq("cafe_id", auth.cafeId)
    .eq("is_open", true);

  const { data: shift, error: sErr } = await admin
    .from("shifts")
    .insert({
      cafe_id: auth.cafeId,
      kind: body.kind,
      is_open: true,
      opened_by: auth.ownerStaffId,
      supervisor_user_id: body.supervisorUserId ?? null,
    })
    .select("id")
    .single();

  if (sErr || !shift) {
    return NextResponse.json({ ok: false, error: "SHIFT_CREATE_FAILED" }, { status: 500 });
  }

  if (Array.isArray(body.assignments) && body.assignments.length) {
    const valid = body.assignments.filter((a) => ALLOWED_ROLES.has(String(a.role)));
    // Reject if caller sends only invalid roles (prevents silent misconfiguration)
    if (valid.length === 0) {
      return NextResponse.json({ ok: false, error: "INVALID_ROLE" }, { status: 400 });
    }

    const rows = valid.map((a) => ({
      cafe_id: auth.cafeId,
      shift_id: shift.id,
      user_id: a.userId,
      role: a.role,
      assigned_by: auth.ownerStaffId,
    }));

    const { error: aErr } = await admin.from("shift_assignments").insert(rows);
    if (aErr) {
      return NextResponse.json({ ok: false, error: "ASSIGNMENTS_FAILED" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, shiftId: shift.id });
}
