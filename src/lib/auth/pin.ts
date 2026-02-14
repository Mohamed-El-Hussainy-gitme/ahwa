export function pinToPassword(pinRaw: string) {
  const pin = (pinRaw ?? "").trim();
  // لو PIN 4 ارقام، نحوله لباسوورد مقبول (>=6) بتكراره
  if (pin.length < 6) return pin + pin;
  return pin;
}

/**
 * Normalize phone for matching & Supabase Auth.
 * - trims
 * - removes spaces/dashes/parentheses
 * - keeps leading + if present
 */
export function normalizePhone(phoneRaw: string) {
  let p = (phoneRaw ?? "").trim();
  if (!p) return "";

  // Handle RTL/UIs where users type "+" at the end (e.g. "2010...+")
  // and generally accept "+" anywhere.
  const hasPlus = p.includes("+") || p.startsWith("00");

  // Convert leading 00 to +
  if (p.startsWith("00")) {
    p = "+" + p.slice(2);
  }

  // Strip everything except digits
  const digits = p.replace(/[^0-9]/g, "");

  // If user provided + anywhere (or 00 prefix), normalize to +<digits>
  if (hasPlus) return "+" + digits;

  // If user typed an international number without '+', keep digits only.
  // (Caller may decide whether to require '+'; we keep behavior conservative.)
  return digits;
}
