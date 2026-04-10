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
      fullName?: string;
      phone?: string;
      ownerLabel?: 'owner' | 'partner' | 'branch_manager';
    };

    if (!body.cafeId?.trim() || !body.ownerUserId?.trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe and owner are required.');
    }

    const fullName = body.fullName?.trim();
    const phone = body.phone?.trim();
    const ownerLabel = body.ownerLabel === 'owner' || body.ownerLabel === 'partner' || body.ownerLabel === 'branch_manager'
      ? body.ownerLabel
      : null;

    if (!fullName && !phone && !ownerLabel) {
      return platformFail(400, 'INVALID_INPUT', 'Provide at least one field to update.');
    }

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_update_owner_user', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
      p_owner_user_id: body.ownerUserId.trim(),
      p_full_name: fullName ?? null,
      p_phone: phone ?? null,
      p_owner_label: ownerLabel,
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
