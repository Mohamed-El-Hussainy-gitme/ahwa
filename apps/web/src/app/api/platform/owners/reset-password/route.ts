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
      ownerUserId?: string;
      newPassword?: string;
    };

    if (!body.cafeId?.trim() || !body.ownerUserId?.trim() || !(body.newPassword ?? '').trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe, owner, and password are required.');
    }

    assertPlatformEnv();

    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc('platform_reset_owner_password', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
      p_owner_user_id: body.ownerUserId.trim(),
      p_new_password: body.newPassword,
    });

    if (error) {
      throw error;
    }

    return platformOk({ data });
  } catch (error) {
    return platformJsonError(error);
  }
}
