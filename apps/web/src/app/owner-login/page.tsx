import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import OwnerLoginClient from './OwnerLoginClient';
import { getRuntimeMe, getRuntimeResumePath } from '@/lib/runtime/server';

export const dynamic = 'force-dynamic';

export default async function OwnerLoginPage() {
  const me = await getRuntimeMe();
  const resumePath = await getRuntimeResumePath();
  if (me) {
    if (resumePath) redirect(resumePath);
    if (me.accountKind === 'owner' || me.shiftRole === 'supervisor') redirect('/dashboard');
    if (me.shiftRole === 'barista') redirect('/kitchen');
    if (me.shiftRole === 'shisha') redirect('/shisha');
    redirect('/orders');
  }
  return <Suspense fallback={<div className='min-h-dvh bg-neutral-50' />}><OwnerLoginClient /></Suspense>;
}
