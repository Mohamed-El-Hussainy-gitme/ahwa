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
      capacityBytes?: number | null;
    };

    const raw = body.capacityBytes;
    const capacityBytes =
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.floor(raw)
        : raw === null
          ? null
          : null;

    if (raw !== null && typeof raw !== 'number') {
      return platformFail(400, 'INVALID_INPUT', 'capacityBytes must be a number or null.');
    }

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_set_database_capacity_bytes', {
      p_super_admin_user_id: session.superAdminUserId,
      p_database_capacity_bytes: capacityBytes,
    });

    if (error) throw error;

    return platformOk({ data: data ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
