import { z } from 'zod';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

const schema = z.object({
  messageId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

type RevokeRpcResult = {
  support_message_id?: string;
  cafe_id?: string;
  revoked_count?: number;
};

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const admin = controlPlaneAdmin();

    const { data, error } = await admin.rpc('platform_revoke_support_access_from_message', {
      p_super_admin_user_id: session.superAdminUserId,
      p_support_message_id: payload.messageId,
      p_notes: payload.note?.trim() || null,
    });

    if (error) throw error;

    const rpc = (data ?? {}) as RevokeRpcResult;

    return platformOk({
      data: {
        supportMessageId: rpc.support_message_id ?? payload.messageId,
        cafeId: rpc.cafe_id ?? null,
        revokedCount: Number(rpc.revoked_count ?? 0),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return platformJsonError(new Error(error.issues[0]?.message ?? 'INVALID_INPUT'), 400);
    }
    return platformJsonError(error);
  }
}
