import crypto from 'node:crypto';
import type { OpsRealtimeEvent } from '@/lib/ops/types';

export type OpsRealtimeEventInput = Omit<OpsRealtimeEvent, 'id' | 'at' | 'version' | 'stream' | 'cursor' | 'scopes'> & {
  id?: string | null;
  at?: string | null;
  version?: 1;
  stream?: string | null;
  cursor?: string | null;
  scopes?: string[] | null;
};

export function normalizeOpsRealtimeEvent(input: OpsRealtimeEventInput): OpsRealtimeEvent {
  return {
    id: String(input.id ?? '').trim() || crypto.randomUUID(),
    type: String(input.type ?? '').trim(),
    cafeId: String(input.cafeId ?? '').trim(),
    shiftId: input.shiftId ? String(input.shiftId) : null,
    entityId: input.entityId ? String(input.entityId) : null,
    at: input.at ? new Date(input.at).toISOString() : new Date().toISOString(),
    data: input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {},
    version: 1,
    stream: String(input.stream ?? '').trim() || 'ops',
    cursor: input.cursor ? String(input.cursor) : null,
    scopes: Array.isArray(input.scopes)
      ? input.scopes.map((value) => String(value ?? '').trim()).filter(Boolean)
      : [],
  } satisfies OpsRealtimeEvent;
}

export function getOpsEventStreamName(cafeId: string, prefix = 'ahwa') {
  const normalizedCafeId = String(cafeId ?? '').trim();
  if (!normalizedCafeId) {
    throw new Error('cafeId is required');
  }
  const normalizedPrefix = String(prefix ?? '').trim() || 'ahwa';
  return `${normalizedPrefix}:ops:cafe:${normalizedCafeId}`;
}
