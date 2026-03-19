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
      cafeId?: string;
      cafeLoadTier?: 'small' | 'medium' | 'heavy' | 'enterprise';
    };

    const cafeId = body.cafeId?.trim() ?? '';
    const cafeLoadTier = typeof body.cafeLoadTier === 'string' ? body.cafeLoadTier : '';

    if (!cafeId || !['small', 'medium', 'heavy', 'enterprise'].includes(cafeLoadTier)) {
      return platformFail(400, 'INVALID_INPUT', 'cafeId and cafeLoadTier are required.');
    }

    const { data, error } = await controlPlaneAdmin().rpc('control_set_cafe_load_tier', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: cafeId,
      p_cafe_load_tier: cafeLoadTier,
    });
    if (error) throw error;

    return platformOk({ data: data ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
