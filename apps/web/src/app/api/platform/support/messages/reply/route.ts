import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

const schema = z.object({
  messageId: z.string().uuid(),
  replyNote: z.string().trim().min(2).max(2000),
  setStatus: z.enum(['new', 'in_progress', 'closed']).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const admin = supabaseAdmin();

    const { error } = await admin
      .schema('platform')
      .from('support_message_replies')
      .insert({
        support_message_id: payload.messageId,
        author_super_admin_user_id: session.superAdminUserId,
        reply_note: payload.replyNote,
      });
    if (error) throw error;

    if (payload.setStatus) {
      const { error: updateError } = await admin
        .schema('platform')
        .from('support_messages')
        .update({ status: payload.setStatus })
        .eq('id', payload.messageId);
      if (updateError) throw updateError;
    }

    return platformOk({ data: { ok: true } });
  } catch (error) {
    return platformJsonError(error);
  }
}
