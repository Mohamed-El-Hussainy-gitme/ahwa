import { redirect } from "next/navigation";
import ClientProviders from "./ClientProviders";
import { readAnySessionFromServerCookies } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sess = await readAnySessionFromServerCookies();
  if (!sess) redirect("/login");

  const admin = supabaseAdmin();

  // Map partner sessions to the owner staff profile in that cafe (to reuse existing UI/permissions).
  if (sess.typ === "partner") {
    const ownerProf = await admin
      .from("staff_profiles")
      .select("id,cafe_id,name,base_role,is_active")
      .eq("cafe_id", sess.cafeId)
      .eq("base_role", "owner")
      .limit(1)
      .maybeSingle();

    if (ownerProf.error || !ownerProf.data || !ownerProf.data.is_active) {
      redirect("/login");
    }

    const user = {
      id: String(ownerProf.data.id),
      cafeId: String(ownerProf.data.cafe_id),
      name: String(ownerProf.data.name ?? "Owner"),
      baseRole: "owner" as const,
    };

    return <ClientProviders user={user}>{children}</ClientProviders>;
  }

  // Staff session
  const staffRes = await admin
    .from("staff_profiles")
    .select("id,cafe_id,name,base_role,is_active,pin_version")
    .eq("id", sess.staffId)
    .maybeSingle();

  if (staffRes.error || !staffRes.data || !staffRes.data.is_active) {
    redirect("/login");
  }

  // If owner changed the PIN, force re-login.
  if (Number(staffRes.data.pin_version ?? 0) !== Number(sess.pinVersion ?? 0)) {
    redirect("/login?e=pin_changed");
  }

  const user = {
    id: String(staffRes.data.id),
    cafeId: String(staffRes.data.cafe_id),
    name: String(staffRes.data.name ?? "Staff"),
    baseRole: (String(staffRes.data.base_role) === "owner" ? "owner" : "staff") as "owner" | "staff",
  };

  return <ClientProviders user={user}>{children}</ClientProviders>;
}
