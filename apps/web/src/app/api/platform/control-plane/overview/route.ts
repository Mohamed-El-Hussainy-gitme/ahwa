import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function GET() {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('control_platform_overview', {
      p_super_admin_user_id: session.superAdminUserId,
    });

    if (error) {
      throw error;
    }

    return platformOk({ data: data ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
