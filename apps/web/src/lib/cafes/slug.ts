export function canonicalizeCafeSlug(raw: string | null | undefined): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase(['ar-EG', 'en-US'])
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

export function normalizeCafeSlugForLookup(raw: string | null | undefined): string {
  return canonicalizeCafeSlug(raw);
}
