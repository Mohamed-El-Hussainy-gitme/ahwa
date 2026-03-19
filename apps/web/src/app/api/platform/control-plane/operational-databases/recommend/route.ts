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
    assertPlatformEnv();

    const body = (await request.json().catch(() => ({}))) as {
      cafeLoadTier?: 'small' | 'medium' | 'heavy' | 'enterprise';
    };
    const cafeLoadTier = typeof body.cafeLoadTier === 'string' ? body.cafeLoadTier : 'small';
    if (!['small', 'medium', 'heavy', 'enterprise'].includes(cafeLoadTier)) {
      return platformFail(400, 'INVALID_INPUT', 'cafeLoadTier is invalid.');
    }

    const { data, error } = await controlPlaneAdmin().rpc('control_recommend_operational_database', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_load_tier: cafeLoadTier,
    });
    if (error) throw error;

    return platformOk({ data: data ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
