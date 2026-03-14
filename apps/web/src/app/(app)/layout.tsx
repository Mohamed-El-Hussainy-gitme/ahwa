import { redirect } from "next/navigation";
import ClientProviders from "./ClientProviders";
import { getRuntimeMe } from "@/lib/runtime/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getRuntimeMe();
  if (!me) redirect("/login");

  const baseRole: "owner" | "staff" = me.accountKind === "owner" ? "owner" : "staff";

  const user = {
    id: me.userId,
    cafeId: me.tenantId,
    name: me.fullName,
    baseRole,
  };

  return <ClientProviders user={user}>{children}</ClientProviders>;
}