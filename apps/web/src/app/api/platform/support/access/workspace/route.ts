import { z } from 'zod';
import { buildPlatformSupportWorkspace } from '@/lib/platform-support/access';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

const querySchema = z.object({
  messageId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const url = new URL(request.url);
    const query = querySchema.parse({
      messageId: url.searchParams.get('messageId') ?? undefined,
    });

    const data = await buildPlatformSupportWorkspace(session.superAdminUserId, query.messageId);
    return platformOk({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return platformJsonError(new Error(error.issues[0]?.message ?? 'INVALID_INPUT'), 400);
    }
    return platformJsonError(error);
  }
}
