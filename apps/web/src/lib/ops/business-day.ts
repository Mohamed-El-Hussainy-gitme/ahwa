export const BUSINESS_DAY_TIME_ZONE = 'Africa/Cairo';

export function normalizeBusinessDayStartMinutes(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const normalized = Math.trunc(numeric);
  if (normalized < 0) return 0;
  if (normalized > 1439) return 1439;
  return normalized;
}

export function parseBusinessDayStartTime(value: string): number | null {
  const normalized = String(value ?? '').trim();
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatBusinessDayStartTime(minutes: number): string {
  const normalized = normalizeBusinessDayStartMinutes(minutes);
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function shiftIsoDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timeZoneParts(date: Date, timeZone = BUSINESS_DAY_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value] as const));
  const year = byType.get('year') ?? '0000';
  const month = byType.get('month') ?? '01';
  const day = byType.get('day') ?? '01';
  const hour = Number(byType.get('hour') ?? '0');
  const minute = Number(byType.get('minute') ?? '0');

  return {
    isoDate: `${year}-${month}-${day}`,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export function currentTimeZoneDate(timeZone = BUSINESS_DAY_TIME_ZONE, now = new Date()): string {
  return timeZoneParts(now, timeZone).isoDate;
}

export function resolveBusinessDate(now: Date, businessDayStartMinutes: number, timeZone = BUSINESS_DAY_TIME_ZONE): string {
  const parts = timeZoneParts(now, timeZone);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const normalizedStartMinutes = normalizeBusinessDayStartMinutes(businessDayStartMinutes);
  if (currentMinutes < normalizedStartMinutes) {
    return shiftIsoDate(parts.isoDate, -1);
  }
  return parts.isoDate;
}

export function describeBusinessDayWindow(startMinutes: number): string {
  const startTime = formatBusinessDayStartTime(startMinutes);
  return `من ${startTime} إلى ${startTime} اليوم التالي`;
}
