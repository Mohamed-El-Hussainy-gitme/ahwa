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
    const body = (await request.json().catch(() => ({}))) as { cafeId?: string };

    if (!body.cafeId?.trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe ID is required.');
    }

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_list_cafe_subscriptions', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: body.cafeId.trim(),
    });

    if (error) {
      throw error;
    }

    return platformOk({ items: data ?? [] });
  } catch (error) {
    return platformJsonError(error);
  }
}
