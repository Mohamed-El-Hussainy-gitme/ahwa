import 'server-only';

import { getOperationalAdminClient, getOperationalAdminOpsClient } from '@/lib/operational-db/server';
import { readValidatedPlatformSupportContext } from '@/lib/control-plane/support-access';

export async function requirePlatformSupportOperationalRoute() {
  const { platformAdmin, supportSession, supportAccess } = await readValidatedPlatformSupportContext();
  if (!supportSession || !supportAccess) {
    throw new Error('PLATFORM_SUPPORT_SESSION_REQUIRED');
  }

  return {
    platformAdmin,
    supportSession,
    supportAccess,
    cafeId: supportAccess.cafe_id,
    databaseKey: supportAccess.database_key,
  };
}

export async function getPlatformSupportOperationalAdminClient() {
  const route = await requirePlatformSupportOperationalRoute();
  return {
    ...route,
    admin: getOperationalAdminClient(route.databaseKey),
  };
}

export async function getPlatformSupportOperationalAdminOpsClient() {
  const route = await requirePlatformSupportOperationalRoute();
  return {
    ...route,
    admin: getOperationalAdminOpsClient(route.databaseKey),
  };
}
