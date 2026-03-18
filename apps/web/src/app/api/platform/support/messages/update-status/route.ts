import { z } from 'zod';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

const schema = z.object({
  messageId: z.string().uuid(),
  status: z.enum(['new', 'in_progress', 'closed']),
});

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const admin = controlPlaneAdmin();

    const { error } = await admin
      .schema('platform')
      .from('support_messages')
      .update({ status: payload.status })
      .eq('id', payload.messageId);
    if (error) throw error;

    if (payload.status === 'closed') {
      const { error: revokeError } = await admin.rpc('platform_revoke_support_access_from_message', {
        p_super_admin_user_id: session.superAdminUserId,
        p_support_message_id: payload.messageId,
        p_notes: 'AUTO_REVOKED_ON_CLOSE',
      });
      if (revokeError && revokeError.message !== 'support_message_requires_cafe') {
        throw revokeError;
      }
    }

    return platformOk({ data: { ok: true } });
  } catch (error) {
    return platformJsonError(error);
  }
}
