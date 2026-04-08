import { adminOps } from '@/app/api/ops/_server';
import type { StationCode } from '@/lib/ops/types';

function normalizeOrderNotePreset(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function resolvePresetStationCode(productStationCodes: readonly StationCode[]): StationCode | null {
  const uniqueCodes = Array.from(new Set(productStationCodes));
  return uniqueCodes.length === 1 ? (uniqueCodes[0] ?? null) : null;
}

export async function persistOrderNotePreset(input: {
  cafeId: string;
  databaseKey: string;
  note: string | null | undefined;
  productStationCodes: readonly StationCode[];
}) {
  const normalizedNote = normalizeOrderNotePreset(String(input.note ?? ''));
  if (!normalizedNote) {
    return;
  }

  const stationCode = resolvePresetStationCode(input.productStationCodes);
  const now = new Date().toISOString();
  const admin = adminOps(input.databaseKey);

  const { data: existing, error: lookupError } = await admin
    .from('order_note_presets')
    .select('id, usage_count')
    .eq('cafe_id', input.cafeId)
    .eq('normalized_text', normalizedNote.toLocaleLowerCase('en-US'))
    .eq('station_scope', stationCode ?? 'all')
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing?.id) {
    const { error } = await admin
      .from('order_note_presets')
      .update({
        note_text: normalizedNote,
        usage_count: Number(existing.usage_count ?? 0) + 1,
        last_used_at: now,
        updated_at: now,
        is_active: true,
      })
      .eq('id', existing.id);

    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await admin.from('order_note_presets').insert({
    cafe_id: input.cafeId,
    station_code: stationCode,
    note_text: normalizedNote,
    normalized_text: normalizedNote.toLocaleLowerCase('en-US'),
    usage_count: 1,
    last_used_at: now,
    updated_at: now,
    is_active: true,
  });

  if (error) {
    throw error;
  }
}