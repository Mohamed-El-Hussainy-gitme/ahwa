import { adminOps, requireBoundOperationalDatabaseKey } from '@/app/api/ops/_server';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import type { OpsActorContext } from '@/app/api/ops/_helpers';

type JsonObject = Record<string, unknown>;

type OrderItemMutationContext = {
  id: string;
  shiftId: string;
  serviceSessionId: string | null;
  stationCode: string | null;
};

function asJsonObject<T extends JsonObject>(value: unknown, functionName: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`INVALID_RPC_RESPONSE:${functionName}`);
  }

  return value as T;
}

export async function callOpsRpc<T extends JsonObject>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const databaseKey = requireBoundOperationalDatabaseKey(`callOpsRpc:${functionName}`);
  const { data, error } = await supabaseAdminForDatabase(databaseKey).rpc(functionName, args);
  if (error) {
    throw error;
  }

  return asJsonObject<T>(data, functionName);
}

export function actorRpcParams(
  ctx: Pick<OpsActorContext, 'actorStaffId' | 'actorOwnerId'>,
  staffParamName: string,
  ownerParamName: string,
): Record<string, string | null> {
  return {
    [staffParamName]: ctx.actorStaffId,
    [ownerParamName]: ctx.actorOwnerId,
  };
}

export async function loadOrderItemMutationContext(
  cafeId: string,
  orderItemId: string,
): Promise<OrderItemMutationContext> {
  const { data, error } = await adminOps()
    .from('order_items')
    .select('id, shift_id, service_session_id, station_code')
    .eq('cafe_id', cafeId)
    .eq('id', orderItemId)
    .single();

  if (error) {
    throw error;
  }

  const row = data as {
    id?: string | null;
    shift_id?: string | null;
    service_session_id?: string | null;
    station_code?: string | null;
  } | null;

  if (!row?.id || !row.shift_id) {
    throw new Error('ORDER_ITEM_NOT_FOUND');
  }

  return {
    id: String(row.id),
    shiftId: String(row.shift_id),
    serviceSessionId: row.service_session_id ? String(row.service_session_id) : null,
    stationCode: row.station_code ? String(row.station_code) : null,
  };
}
