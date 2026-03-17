import { controlPlaneAdmin } from '@/lib/control-plane/admin';
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
      password?: string;
      ownerLabel?: 'owner' | 'partner';
    };

    if (
      !body.cafeId?.trim() ||
      !body.fullName?.trim() ||
      !body.phone?.trim() ||
      !(body.password ?? '').trim()
    ) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe, name, phone, and password are required.');
    }

    const ownerLabel = body.ownerLabel === 'owner' ? 'owner' : 'partner';

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_create_owner_user', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
      p_full_name: body.fullName.trim(),
      p_phone: body.phone.trim(),
      p_password: body.password,
      p_owner_label: ownerLabel,
    });

    if (error) {
      throw error;
    }

    return platformOk({ data });
  } catch (error) {
    return platformJsonError(error);
  }
}
