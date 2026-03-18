import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { mirrorOwnerToOperationalDatabase } from '@/lib/control-plane/runtime-provisioning';
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
    };

    if (!body.cafeId?.trim() || !body.ownerUserId?.trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe and owner are required.');
    }

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_reset_owner_password', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
      p_owner_user_id: body.ownerUserId.trim(),
      p_new_password: '',
    });

    if (error) {
      throw error;
    }

    await mirrorOwnerToOperationalDatabase(body.cafeId.trim(), body.ownerUserId.trim());

    const payload = data && typeof data === 'object'
      ? data as {
          owner_user_id?: string | null;
          password_state?: string | null;
          password_setup_code?: string | null;
          password_setup_expires_at?: string | null;
        }
      : null;

    return platformOk({
      data: {
        owner_user_id: payload?.owner_user_id ?? body.ownerUserId.trim(),
        password_state: payload?.password_state ?? 'reset_pending',
        password_setup_code: payload?.password_setup_code ?? null,
        password_setup_expires_at: payload?.password_setup_expires_at ?? null,
      },
    });
  } catch (error) {
    return platformJsonError(error);
  }
}
