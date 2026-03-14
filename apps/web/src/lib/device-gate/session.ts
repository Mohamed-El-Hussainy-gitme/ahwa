import { createHmac, timingSafeEqual } from 'crypto';

export const DEVICE_GATE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type DeviceGateSession = {
  cafeId: string;
  cafeSlug: string;
  label: string;
  deviceType: 'mobile_phone' | 'tablet' | 'desktop' | 'kiosk';
  deviceMode: 'shared_runtime' | 'station_only' | 'owner_private';
  stationType?: 'barista' | 'shisha' | 'kitchen' | 'service' | null;
  activatedAt: string;
};

function getSecret(): string {
  const secret = process.env.AHWA_SESSION_SECRET;
  if (!secret) throw new Error('AHWA_SESSION_SECRET is missing');
  return `${secret}:device-gate`;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload, 'utf8').digest('base64url');
}

export function encodeDeviceGateSession(session: DeviceGateSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeDeviceGateSession(raw: string | null | undefined): DeviceGateSession | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<DeviceGateSession>;
    if (!parsed || typeof parsed.cafeId !== 'string' || typeof parsed.cafeSlug !== 'string' || typeof parsed.label !== 'string' || typeof parsed.activatedAt !== 'string') {
      return null;
    }
    if (parsed.deviceType !== 'mobile_phone' && parsed.deviceType !== 'tablet' && parsed.deviceType !== 'desktop' && parsed.deviceType !== 'kiosk') {
      return null;
    }
    if (parsed.deviceMode !== 'shared_runtime' && parsed.deviceMode !== 'station_only' && parsed.deviceMode !== 'owner_private') {
      return null;
    }

    return {
      cafeId: parsed.cafeId,
      cafeSlug: parsed.cafeSlug,
      label: parsed.label,
      deviceType: parsed.deviceType,
      deviceMode: parsed.deviceMode,
      stationType:
        parsed.stationType === 'barista' ||
        parsed.stationType === 'shisha' ||
        parsed.stationType === 'kitchen' ||
        parsed.stationType === 'service'
          ? parsed.stationType
          : null,
      activatedAt: parsed.activatedAt,
    };
  } catch {
    return null;
  }
}
