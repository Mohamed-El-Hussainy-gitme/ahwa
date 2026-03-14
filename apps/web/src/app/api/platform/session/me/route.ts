import {
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function GET() {
  try {
    const session = await requirePlatformAdmin();
    return platformOk({ session });
  } catch (error) {
    return platformJsonError(error, 401);
  }
}
