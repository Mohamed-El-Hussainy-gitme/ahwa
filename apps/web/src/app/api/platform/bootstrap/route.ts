import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import {
  assertBootstrapAuthorized,
  assertPlatformEnv,
  platformFail,
  platformJsonError,
  platformOk,
  PlatformApiError,
} from '@/app/api/platform/_auth';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      displayName?: string;
      password?: string;
      installToken?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const displayName = body.displayName?.trim();
    const password = body.password ?? '';

    if (!email || !displayName || !password) {
      return platformFail(400, 'INVALID_INPUT', 'Email, display name, and password are required.');
    }

    assertPlatformEnv();
    assertBootstrapAuthorized(request, body.installToken);

    const admin = controlPlaneAdmin();
    const existing = await admin
      .schema('platform')
      .from('super_admin_users')
      .select('id', { count: 'exact', head: true });

    if (existing.error) {
      throw new PlatformApiError('REQUEST_FAILED', existing.error.message, 400);
    }

    if ((existing.count ?? 0) > 0) {
      return platformFail(409, 'SUPER_ADMIN_ALREADY_EXISTS', 'A super admin already exists.');
    }

    const { data, error } = await admin.rpc('platform_create_super_admin_user', {
      p_email: email,
      p_display_name: displayName,
      p_password: password,
    });

    if (error) {
      throw new PlatformApiError('REQUEST_FAILED', error.message, 400);
    }

    return platformOk({ data });
  } catch (error) {
    return platformJsonError(error);
  }
}
