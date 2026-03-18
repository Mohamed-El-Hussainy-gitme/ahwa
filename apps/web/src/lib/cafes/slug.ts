export function normalizeCafeSlug(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u200c\u200d\u200e\u200f\u061c\u0640]/g, '')
    .trim();

  return cleaned
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

export function cafeSlugEquals(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeCafeSlug(left) === normalizeCafeSlug(right);
}
