import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  assertPlatformEnv,
  platformFail,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      cafeId?: string;
      startsAt?: string;
      endsAt?: string;
      graceDays?: number;
      status?: 'trial' | 'active' | 'expired' | 'suspended';
      notes?: string;
    };

    if (!body.cafeId?.trim() || !body.startsAt?.trim() || !body.endsAt?.trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe and subscription dates are required.');
    }

    const graceDays = Number.isFinite(body.graceDays) ? Number(body.graceDays) : 0;
    const status =
      body.status === 'trial' ||
      body.status === 'active' ||
      body.status === 'expired' ||
      body.status === 'suspended'
        ? body.status
        : 'active';

    assertPlatformEnv();

    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc('platform_record_cafe_subscription', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_grace_days: graceDays,
      p_status: status,
      p_notes: body.notes?.trim() || null,
    });

    if (error) {
      throw error;
    }

    return platformOk({ data });
  } catch (error) {
    return platformJsonError(error);
  }
}
