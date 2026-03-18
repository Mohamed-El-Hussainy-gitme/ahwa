import type { StationCode } from '@/lib/ops/types';

export function normalizeStationCode(value: unknown): StationCode {
  return value === 'shisha' ? 'shisha' : 'barista';
}

export function normalizeNullableStationCode(value: unknown): StationCode | null {
  if (value == null) return null;
  return normalizeStationCode(value);
}

export function isStationCode(value: unknown): value is StationCode {
  return value === 'barista' || value === 'shisha';
}
