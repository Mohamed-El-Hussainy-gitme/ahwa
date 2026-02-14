import { supabaseAdmin } from "@/lib/supabase/admin";
import { readAnySessionFromServerCookies } from "@/lib/auth/session";

export async function requireOwner() {
  const sess = await readAnySessionFromServerCookies();
  if (!sess) return { ok: false as const, status: 401, error: "UNAUTHENTICATED" };

  const admin = supabaseAdmin();

  // Partner session: treat as owner of cafe, map to the owner's staff_profiles row
  if (sess.typ === "partner") {
    const ownerProf = await admin
      .from("staff_profiles")
      .select("id,cafe_id,is_active,base_role")
      .eq("cafe_id", sess.cafeId)
      .eq("base_role", "owner")
      .limit(1)
      .maybeSingle();

    if (ownerProf.error || !ownerProf.data || !ownerProf.data.is_active) {
      return { ok: false as const, status: 403, error: "PROFILE_NOT_ACTIVE" };
    }

    return {
      ok: true as const,
      cafeId: String(sess.cafeId),
      ownerStaffId: String(ownerProf.data.id),
    };
  }

  // Staff session: allow only if base_role is owner
  const prof = await admin
    .from("staff_profiles")
    .select("id,cafe_id,base_role,is_active")
    .eq("id", sess.staffId)
    .maybeSingle();

  if (prof.error || !prof.data || !prof.data.is_active) {
    return { ok: false as const, status: 403, error: "PROFILE_NOT_ACTIVE" };
  }
  if (String(prof.data.base_role) !== "owner") {
    return { ok: false as const, status: 403, error: "NOT_OWNER" };
  }

  return {
    ok: true as const,
    cafeId: String(prof.data.cafe_id),
    ownerStaffId: String(prof.data.id),
  };
}
