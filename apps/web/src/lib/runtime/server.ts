import { redirect } from 'next/navigation';
import { getEnrichedRuntimeMeFromCookie, type EnrichedRuntimeMe } from '@/lib/runtime/me';

export type RuntimeMe = EnrichedRuntimeMe;

export async function getRuntimeMe(): Promise<RuntimeMe | null> {
  return getEnrichedRuntimeMeFromCookie();
}

export async function requireRuntimeMe(): Promise<RuntimeMe> {
  const me = await getRuntimeMe();
  if (!me) {
    redirect('/login');
  }
  return me;
}
