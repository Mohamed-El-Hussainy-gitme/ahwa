import { z } from 'zod';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

type SupportAccessStatus = 'not_requested' | 'requested' | 'granted' | 'revoked' | 'expired';

const querySchema = z.object({
  status: z.enum(['all', 'new', 'in_progress', 'closed']).optional(),
  cafeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function normalizeSupportAccessStatus(status: unknown, expiresAt: unknown): SupportAccessStatus {
  const normalized = typeof status === 'string' ? status : 'not_requested';
  if (normalized === 'granted' && typeof expiresAt === 'string') {
    const expiresAtMs = new Date(expiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return 'expired';
    }
  }

  if (
    normalized === 'requested' ||
    normalized === 'granted' ||
    normalized === 'revoked' ||
    normalized === 'expired'
  ) {
    return normalized;
  }

  return 'not_requested';
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();
    const admin = controlPlaneAdmin();
    const url = new URL(request.url);
    const query = querySchema.parse({
      status: url.searchParams.get('status') ?? undefined,
      cafeId: url.searchParams.get('cafeId') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    let builder = admin
      .schema('platform')
      .from('support_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(query.limit ?? 80);

    if (query.status && query.status !== 'all') builder = builder.eq('status', query.status);
    if (query.cafeId) builder = builder.eq('cafe_id', query.cafeId);

    const { data: messages, error } = await builder;
    if (error) throw error;

    const ids = (messages ?? []).map((item) => item.id);
    let replies: Array<Record<string, unknown>> = [];
    if (ids.length) {
      const { data, error: repliesError } = await admin
        .schema('platform')
        .from('support_message_replies')
        .select('id,support_message_id,author_super_admin_user_id,reply_note,created_at')
        .in('support_message_id', ids)
        .order('created_at', { ascending: true });
      if (repliesError) throw repliesError;
      replies = data ?? [];
    }

    const replyMap = new Map<string, Array<Record<string, unknown>>>();
    for (const reply of replies) {
      const key = String(reply.support_message_id ?? '');
      if (!replyMap.has(key)) replyMap.set(key, []);
      replyMap.get(key)!.push(reply);
    }

    const enriched = (messages ?? []).map((item) => ({
      ...item,
      support_access_requested: Boolean(item.support_access_requested),
      support_access_status: normalizeSupportAccessStatus(item.support_access_status, item.support_access_expires_at),
      replies: replyMap.get(String(item.id)) ?? [],
    }));

    const summary = {
      total: enriched.length,
      new_count: enriched.filter((item) => item.status === 'new').length,
      in_progress_count: enriched.filter((item) => item.status === 'in_progress').length,
      closed_count: enriched.filter((item) => item.status === 'closed').length,
      high_priority_count: enriched.filter((item) => item.priority === 'high' && item.status !== 'closed').length,
    };

    return platformOk({ data: { summary, items: enriched } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return platformJsonError(new Error(error.issues[0]?.message ?? 'INVALID_INPUT'), 400);
    }
    return platformJsonError(error);
  }
}
