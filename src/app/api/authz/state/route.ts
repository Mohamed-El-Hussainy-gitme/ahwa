import { NextResponse } from "next/server";
import { readAnySessionFromServerCookies } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ShiftRole } from "@/domain/model";

const ALLOWED_ROLES: ReadonlySet<string> = new Set(["supervisor", "waiter", "barista", "shisha"]);

type ShiftRow = {
  id: string;
  kind: "morning" | "evening";
  started_at: string;
  ended_at: string | null;
  is_open: boolean;
  supervisor_user_id: string | null;
};

type AssignmentRow = { user_id: string; role: string };

export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await readAnySessionFromServerCookies();
  if (!sess) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  const cafeId = sess.cafeId;
  const admin = supabaseAdmin();

  const { data: shift, error: sErr } = await admin
    .from("shifts")
    .select("id,kind,started_at,ended_at,is_open,supervisor_user_id")
    .eq("cafe_id", cafeId)
    .eq("is_open", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const shiftRow = shift as unknown as ShiftRow | null;

  if (sErr || !shiftRow) {
    return NextResponse.json({ ok: true, shift: null, assignments: [] });
  }

  const { data: asg, error: aErr } = await admin
    .from("shift_assignments")
    .select("user_id,role")
    .eq("shift_id", shiftRow.id);

  if (aErr) {
    return NextResponse.json({ ok: false, error: "ASSIGNMENTS_FETCH_FAILED" }, { status: 500 });
  }

  const assignments = (asg ?? [])
    .map((x) => ({ userId: String((x as AssignmentRow).user_id), role: String((x as AssignmentRow).role) }))
    .filter((x) => ALLOWED_ROLES.has(x.role)) as Array<{ userId: string; role: ShiftRole }>;

  return NextResponse.json({
    ok: true,
    shift: {
      id: shiftRow.id,
      kind: shiftRow.kind,
      startedAt: new Date(shiftRow.started_at).getTime(),
      endedAt: shiftRow.ended_at ? new Date(shiftRow.ended_at).getTime() : null,
      isOpen: !!shiftRow.is_open,
      supervisorUserId: shiftRow.supervisor_user_id,
    },
    assignments,
  });
}
