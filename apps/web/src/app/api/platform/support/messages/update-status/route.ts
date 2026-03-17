import { z } from 'zod';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

const schema = z.object({
  messageId: z.string().uuid(),
  status: z.enum(['new', 'in_progress', 'closed']),
});

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const admin = controlPlaneAdmin();

    const { error } = await admin
      .schema('platform')
      .from('support_messages')
      .update({ status: payload.status })
      .eq('id', payload.messageId);
    if (error) throw error;

    return platformOk({ data: { ok: true } });
  } catch (error) {
    return platformJsonError(error);
  }
}
