import { redirect } from 'next/navigation';
import {
  getEnrichedRuntimeMeFromCookie,
  isSupportRuntimeSessionError,
  isUnboundRuntimeSessionError,
  type EnrichedRuntimeMe,
} from '@/lib/runtime/me';

export type RuntimeMe = EnrichedRuntimeMe;

export async function getRuntimeMe(): Promise<RuntimeMe | null> {
  try {
    return await getEnrichedRuntimeMeFromCookie();
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      return null;
    }
    throw error;
  }
}

export async function requireRuntimeMe(): Promise<RuntimeMe> {
  const me = await getRuntimeMe();
  if (!me) {
    redirect('/login');
  }
  return me;
}
