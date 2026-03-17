import { z } from 'zod';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';
import { closeSupportAccess, readCurrentPlatformSupportSession } from '@/lib/control-plane/support-access';
import { clearPlatformSupportCookie } from '@/lib/platform-support/session';

const schema = z.object({
  requestId: z.string().uuid().optional(),
  closeNote: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const current = await readCurrentPlatformSupportSession();
    const requestId = payload.requestId ?? current?.requestId;
    if (!requestId) {
      throw new Error('SUPPORT_REQUEST_ID_REQUIRED');
    }

    const data = await closeSupportAccess({
      requestId,
      superAdminUserId: session.superAdminUserId,
      closeNote: payload.closeNote ?? null,
    });
    const response = platformOk({ data });
    if (current?.requestId === requestId) {
      clearPlatformSupportCookie(response);
    }
    return response;
  } catch (error) {
    return platformJsonError(error);
  }
}
