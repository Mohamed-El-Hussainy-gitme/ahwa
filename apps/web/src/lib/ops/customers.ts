const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const EXTENDED_ARABIC_INDIC_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function normalizeDigits(input: string): string {
  return Array.from(input).map((char) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (arabicIndex >= 0) return String(arabicIndex);
    const extendedIndex = EXTENDED_ARABIC_INDIC_DIGITS.indexOf(char);
    if (extendedIndex >= 0) return String(extendedIndex);
    return char;
  }).join('');
}

export function normalizeCustomerName(value: string): string {
  return normalizeDigits(value)
    .replace(/[\u0640]/g, '')
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeCustomerPhone(value: string): string {
  let digits = normalizeDigits(value).replace(/\D+/g, '');
  if (!digits) return '';

  if (digits.startsWith('0020') && digits.length >= 13) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('20') && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  }

  return digits;
}

export function cleanCustomerText(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}
