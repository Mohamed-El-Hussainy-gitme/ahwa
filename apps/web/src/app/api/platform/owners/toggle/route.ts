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
      isActive?: boolean;
    };

    if (!body.cafeId?.trim() || !body.ownerUserId?.trim() || typeof body.isActive !== 'boolean') {
      return platformFail(400, 'INVALID_INPUT', 'Cafe, owner, and target state are required.');
    }

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_set_owner_user_active', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
      p_owner_user_id: body.ownerUserId.trim(),
      p_is_active: body.isActive,
    });

    if (error) {
      throw error;
    }

    await mirrorOwnerToOperationalDatabase(body.cafeId.trim(), body.ownerUserId.trim());

    return platformOk({ data });
  } catch (error) {
    return platformJsonError(error);
  }
}
