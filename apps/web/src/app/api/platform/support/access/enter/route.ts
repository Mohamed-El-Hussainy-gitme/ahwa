import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setGateSlugCookie, setRuntimeSessionCookie } from '@/lib/auth/cookies';
import { createPlatformSupportRuntimeSession } from '@/lib/platform-support/runtime-session';
import { assertPlatformEnv, platformJsonError, requirePlatformAdmin } from '@/app/api/platform/_auth';

const querySchema = z.object({
  messageId: z.string().uuid(),
  next: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const url = new URL(request.url);
    const query = querySchema.parse({
      messageId: url.searchParams.get('messageId') ?? undefined,
      next: url.searchParams.get('next') ?? undefined,
    });

    const supportSession = await createPlatformSupportRuntimeSession(session, query.messageId, query.next ?? '/dashboard');
    const response = NextResponse.redirect(new URL(supportSession.redirectTo, request.url));
    setRuntimeSessionCookie(response, supportSession.token, supportSession.maxAgeSeconds);
    if (supportSession.access.cafeSlug) {
      setGateSlugCookie(response, supportSession.access.cafeSlug, supportSession.maxAgeSeconds);
    }
    return response;
  } catch (error) {
    return platformJsonError(error);
  }
}
