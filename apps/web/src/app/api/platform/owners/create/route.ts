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
      fullName?: string;
      phone?: string;
      ownerLabel?: 'owner' | 'partner' | 'branch_manager';
    };

    if (!body.cafeId?.trim() || !body.fullName?.trim() || !body.phone?.trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe, name, and phone are required.');
    }

    const ownerLabel = body.ownerLabel === 'owner' || body.ownerLabel === 'branch_manager' ? body.ownerLabel : 'partner';

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_create_owner_user', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
      p_full_name: body.fullName.trim(),
      p_phone: body.phone.trim(),
      p_password: '',
      p_owner_label: ownerLabel,
    });

    if (error) {
      throw error;
    }

    const created = data && typeof data === 'object'
      ? data as {
          owner_user_id?: string | null;
          owner_label?: string | null;
          password_state?: string | null;
          password_setup_code?: string | null;
          password_setup_expires_at?: string | null;
        }
      : null;
    const ownerUserId = typeof created?.owner_user_id === 'string' ? created.owner_user_id.trim() : '';

    if (!ownerUserId) {
      throw new Error('CONTROL_PLANE_CREATE_OWNER_RESPONSE_INVALID');
    }

    await mirrorOwnerToOperationalDatabase(body.cafeId.trim(), ownerUserId);

    return platformOk({
      data: {
        owner_user_id: ownerUserId,
        owner_label: created?.owner_label ?? ownerLabel,
        password_state: created?.password_state ?? 'setup_pending',
        password_setup_code: created?.password_setup_code ?? null,
        password_setup_expires_at: created?.password_setup_expires_at ?? null,
      },
    });
  } catch (error) {
    return platformJsonError(error);
  }
}
