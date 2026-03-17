import { z } from 'zod';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';
import { activateSupportAccess } from '@/lib/control-plane/support-access';
import { setPlatformSupportCookie } from '@/lib/platform-support/session';

const schema = z.object({
  requestId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const data = await activateSupportAccess({
      requestId: payload.requestId,
      superAdminUserId: session.superAdminUserId,
    });

    const response = platformOk({ data });
    setPlatformSupportCookie(response, {
      requestId: String(data.id),
      superAdminUserId: session.superAdminUserId,
      cafeId: String(data.cafe_id),
      databaseKey: String(data.database_key),
      scope: String(data.scope) as 'diagnostic' | 'read_only' | 'guided_write',
      expiresAt: String(data.expires_at),
    });
    return response;
  } catch (error) {
    return platformJsonError(error);
  }
}
