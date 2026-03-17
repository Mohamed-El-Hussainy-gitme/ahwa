import { z } from 'zod';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';
import {
  listSupportAccessRequests,
  readCurrentPlatformSupportSession,
  readValidatedPlatformSupportContext,
} from '@/lib/control-plane/support-access';

const querySchema = z.object({
  cafeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const url = new URL(request.url);
    const query = querySchema.parse({
      cafeId: url.searchParams.get('cafeId') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    const [cookieSession, validated, items] = await Promise.all([
      readCurrentPlatformSupportSession(),
      readValidatedPlatformSupportContext(),
      listSupportAccessRequests({
        superAdminUserId: session.superAdminUserId,
        cafeId: query.cafeId ?? null,
        limit: query.limit ?? 12,
      }),
    ]);

    return platformOk({
      data: {
        cookieSession,
        current: validated.supportAccess,
        items,
      },
    });
  } catch (error) {
    return platformJsonError(error);
  }
}
