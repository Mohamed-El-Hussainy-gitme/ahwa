import { mirrorCafeOwnersToOperationalDatabase } from '@/lib/control-plane/runtime-provisioning';
import {
  assertPlatformEnv,
  platformFail,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = (await request.json().catch(() => ({}))) as { cafeId?: string };

    if (!body.cafeId?.trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe ID is required.');
    }

    assertPlatformEnv();

    const result = await mirrorCafeOwnersToOperationalDatabase(body.cafeId.trim());
    return platformOk({ data: { cafeId: body.cafeId.trim(), ...result } });
  } catch (error) {
    return platformJsonError(error);
  }
}
