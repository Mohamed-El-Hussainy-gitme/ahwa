import 'server-only';

import { cookies } from 'next/headers';
import { readRuntimeSession } from '@/lib/runtime/session';
import { readOperationalDatabaseKeyCookie } from '@/lib/operational-db/cookie';
import { resolveCafeOperationalRouteByCafeId, type ControlPlaneCafeRoute } from '@/lib/control-plane/server';
import { getOperationalAdminClient, getOperationalAdminOpsClient } from '@/lib/operational-db/server';

export async function resolveOperationalRouteFromRuntimeSession(): Promise<ControlPlaneCafeRoute | null> {
  const session = await readRuntimeSession();
  if (!session?.tenantId) {
    return null;
  }

  const route = await resolveCafeOperationalRouteByCafeId(session.tenantId);
  if (!route) {
    return null;
  }

  const cookieStore = await cookies();
  const cookieDatabaseKey = readOperationalDatabaseKeyCookie(cookieStore);
  if (!cookieDatabaseKey) {
    return route;
  }

  if (cookieDatabaseKey !== route.databaseKey) {
    return {
      ...route,
      bindingNotes: route.bindingNotes ? `${route.bindingNotes} | cookie_mismatch:${cookieDatabaseKey}` : `cookie_mismatch:${cookieDatabaseKey}`,
    };
  }

  return route;
}


export async function requireOperationalRouteFromRuntimeSession(): Promise<ControlPlaneCafeRoute> {
  const route = await resolveOperationalRouteFromRuntimeSession();
  if (!route) {
    throw new Error('OPERATIONAL_ROUTE_NOT_FOUND');
  }

  return route;
}

export async function getRuntimeOperationalAdminClient() {
  const route = await requireOperationalRouteFromRuntimeSession();
  return { route, admin: getOperationalAdminClient(route.databaseKey) };
}

export async function getRuntimeOperationalAdminOpsClient() {
  const route = await requireOperationalRouteFromRuntimeSession();
  return { route, admin: getOperationalAdminOpsClient(route.databaseKey) };
}
