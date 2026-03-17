import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function GET() {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('control_list_operational_databases');

    if (error) {
      throw error;
    }

    return platformOk({ items: Array.isArray(data) ? data : [] });
  } catch (error) {
    return platformJsonError(error);
  }
}
