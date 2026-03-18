import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearRuntimeSessionCookie } from '@/lib/auth/cookies';
import { requirePlatformAdmin } from '@/app/api/platform/_auth';

const querySchema = z.object({
  messageId: z.string().uuid().optional(),
  returnTo: z.string().optional(),
});

function safeReturnPath(value: string | null | undefined, messageId: string | null) {
  const next = String(value ?? '').trim();
  if (next.startsWith('/platform/')) return next;
  if (messageId) return `/platform/support/access/${messageId}`;
  return '/platform/support';
}

export async function GET(request: Request) {
  await requirePlatformAdmin();
  const url = new URL(request.url);
  const query = querySchema.parse({
    messageId: url.searchParams.get('messageId') ?? undefined,
    returnTo: url.searchParams.get('returnTo') ?? undefined,
  });

  const response = NextResponse.redirect(new URL(safeReturnPath(query.returnTo, query.messageId ?? null), request.url));
  clearRuntimeSessionCookie(response);
  return response;
}
