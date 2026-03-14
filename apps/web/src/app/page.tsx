import { redirect } from "next/navigation";
import { getRuntimeMe } from "@/lib/runtime/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await getRuntimeMe();

  if (!me) {
    redirect('/login');
  }

  if (me.accountKind === 'owner') {
    redirect('/dashboard');
  }

  if (me.shiftRole === 'supervisor') {
    redirect('/dashboard');
  }

  if (me.shiftRole === 'barista') {
    redirect('/kitchen');
  }

  if (me.shiftRole === 'shisha') {
    redirect('/shisha');
  }

  redirect('/orders');
}
