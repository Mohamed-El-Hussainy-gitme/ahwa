import { redirect } from "next/navigation";
import { getRuntimeMe, getRuntimeResumePath } from "@/lib/runtime/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await getRuntimeMe();
  const resumePath = await getRuntimeResumePath();

  if (!me) redirect('/login');
  if (resumePath) redirect(resumePath);
  if (me.accountKind === 'owner' || me.shiftRole === 'supervisor') redirect('/dashboard');
  if (me.shiftRole === 'barista') redirect('/kitchen');
  if (me.shiftRole === 'shisha') redirect('/shisha');
  redirect('/orders');
}
