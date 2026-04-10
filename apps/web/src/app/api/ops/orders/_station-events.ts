import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, kickOpsOutboxDispatch, publishOpsMutation, requireScopedOrderSelectionAccess, type OpsActorContext } from '@/app/api/ops/_helpers';
import { normalizeNullableStationCode } from '@/lib/ops/stations';
import type { StationCode } from '@/lib/ops/types';
import { sendOpsPushToRoles } from '@/lib/pwa/push-server';

type MenuProductRow = {
  id?: string | null;
  station_code?: StationCode | null;
  is_active?: boolean | null;
};

type ProductStationCacheEntry = {
  stationCode: StationCode;
  isActive: boolean;
  expiresAt: number;
};

const PRODUCT_STATION_CACHE_TTL_MS = 5 * 60_000;
const productStationCache = new Map<string, ProductStationCacheEntry>();

function buildCacheKey(databaseKey: string, cafeId: string, productId: string) {
  return `${databaseKey}:${cafeId}:${productId}`;
}

export async function requireOrderSelectionStationCodes(
  ctx: OpsActorContext,
  productIds: string[],
): Promise<{ stationCodes: StationCode[]; productStationCodes: Map<string, StationCode> }> {
  const now = Date.now();
  const uniqueProductIds = Array.from(new Set(productIds.map((value) => String(value).trim()).filter(Boolean)));
  const productStationCodes = new Map<string, StationCode>();
  const missingIds: string[] = [];

  for (const productId of uniqueProductIds) {
    const cached = productStationCache.get(buildCacheKey(ctx.databaseKey, ctx.cafeId, productId));
    if (cached && cached.expiresAt > now) {
      if (!cached.isActive) {
        throw new Error('INVALID_INPUT');
      }
      productStationCodes.set(productId, cached.stationCode);
      continue;
    }
    missingIds.push(productId);
  }

  if (missingIds.length) {
    const { data, error } = await adminOps(ctx.databaseKey)
      .from('menu_products')
      .select('id, station_code, is_active')
      .eq('cafe_id', ctx.cafeId)
      .in('id', missingIds);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as MenuProductRow[];
    if (rows.length !== missingIds.length) {
      throw new Error('INVALID_INPUT');
    }

    for (const row of rows) {
      const productId = String(row.id ?? '').trim();
      const stationCode = normalizeNullableStationCode(row.station_code);
      const isActive = row.is_active === true;
      if (!productId || !stationCode || !isActive) {
        throw new Error('INVALID_INPUT');
      }
      productStationCache.set(buildCacheKey(ctx.databaseKey, ctx.cafeId, productId), {
        stationCode,
        isActive,
        expiresAt: now + PRODUCT_STATION_CACHE_TTL_MS,
      });
      productStationCodes.set(productId, stationCode);
    }
  }

  const stationCodes = uniqueProductIds.map((productId) => {
    const stationCode = productStationCodes.get(productId);
    if (!stationCode) {
      throw new Error('INVALID_INPUT');
    }
    return stationCode;
  });

  requireScopedOrderSelectionAccess(ctx, stationCodes);
  return { stationCodes, productStationCodes };
}

export function dispatchStationOrderSubmittedInBackground(
  ctx: Pick<OpsActorContext, 'cafeId' | 'shiftId' | 'databaseKey'>,
  input: {
    orderId: string;
    serviceSessionId: string;
    sessionLabel?: string;
    items: Array<{ productId: string; quantity: number }>;
    productStationCodes: Map<string, StationCode>;
    source?: string;
  },
) {
  const stationQuantities = new Map<StationCode, number>();
  for (const item of input.items) {
    const stationCode = input.productStationCodes.get(String(item.productId));
    if (!stationCode) {
      continue;
    }
    stationQuantities.set(stationCode, (stationQuantities.get(stationCode) ?? 0) + Number(item.quantity ?? 0));
  }

  if (!stationQuantities.size) {
    kickOpsOutboxDispatch(ctx);
    return;
  }

  void (async () => {
    await Promise.allSettled(
      Array.from(stationQuantities.entries()).map(async ([stationCode, quantity]) => {
        if (!quantity || quantity <= 0) {
          return;
        }
        const data: Record<string, unknown> = {
          serviceSessionId: input.serviceSessionId,
          sessionLabel: input.sessionLabel,
          stationCode,
          quantity,
          itemsCount: quantity,
        };
        if (input.source) {
          data.source = input.source;
        }
        const eventId = await enqueueOpsMutation(ctx, {
          type: 'station.order_submitted',
          entityId: input.orderId,
          shiftId: ctx.shiftId ?? null,
          data,
          scopes: [stationCode, 'dashboard', 'nav-summary'],
        });
        await publishOpsMutation(ctx, {
          id: eventId,
          type: 'station.order_submitted',
          entityId: input.orderId,
          shiftId: ctx.shiftId ?? null,
          data,
          scopes: [stationCode, 'dashboard', 'nav-summary'],
        });
        await sendOpsPushToRoles({
          cafeId: ctx.cafeId,
          databaseKey: ctx.databaseKey,
          shiftId: ctx.shiftId ?? null,
          roles: stationCode === 'barista' ? ['barista'] : ['shisha'],
          payload: {
            title: stationCode === 'barista' ? 'طلب جديد للباريستا' : 'طلب جديد للشيشة',
            body: input.sessionLabel ? `جلسة ${input.sessionLabel} بها طلب جديد.` : 'يوجد طلب جديد يحتاج التنفيذ الآن.',
            tag: `ops:${stationCode}:submitted:${input.serviceSessionId}`,
            url: stationCode === 'barista' ? '/kitchen' : '/shisha',
            signal: 'station-order',
            requireInteraction: true,
          },
        });
      }),
    );
    kickOpsOutboxDispatch(ctx);
  })();
}
