export type ParsedOrderItemNotes = {
  addonSummary: string | null;
  freeformNotes: string | null;
};

export function parseOrderItemNotes(notes: string | null | undefined): ParsedOrderItemNotes {
  const raw = String(notes ?? '').trim();
  if (!raw) {
    return { addonSummary: null, freeformNotes: null };
  }

  const segments = raw
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);

  let addonSummary: string | null = null;
  const freeformSegments: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith('إضافات:')) {
      addonSummary = segment.replace(/^إضافات:\s*/, '').trim() || null;
      continue;
    }
    freeformSegments.push(segment);
  }

  if (!segments.length) {
    return { addonSummary: null, freeformNotes: raw };
  }

  return {
    addonSummary,
    freeformNotes: freeformSegments.length ? freeformSegments.join(' | ') : null,
  };
}
