import { cookies } from 'next/headers';
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

export async function getRuntimeResumePath(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get('ahwa_last_runtime_path')?.value ?? '';
  if (!raw || !raw.startsWith('/')) return null;
  if (raw.startsWith('/login') || raw.startsWith('/owner-login') || raw.startsWith('/owner-password') || raw.startsWith('/platform')) return null;
  return raw;
}
