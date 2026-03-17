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
    const [{ data, error }, bindingResult] = await Promise.all([
      admin.rpc('platform_get_cafe_detail', {
        p_super_admin_user_id: session.superAdminUserId,
        p_cafe_id: body.cafeId.trim(),
      }),
      admin.schema('control').from('cafe_database_bindings').select('database_key, binding_source').eq('cafe_id', body.cafeId.trim()).maybeSingle(),
    ]);

    if (error) throw error;
    if (bindingResult.error) throw bindingResult.error;

    const enriched =
      data && typeof data === 'object'
        ? {
            ...(data as Record<string, unknown>),
            database_binding: bindingResult.data ?? { database_key: 'ops-db-01', binding_source: 'default' },
          }
        : data;

    return platformOk({ data: enriched ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
