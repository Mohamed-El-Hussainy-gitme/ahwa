import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setDeviceTokenCookie, setGateSlugCookie } from '@/lib/auth/cookies';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { encodeDeviceGateSession, DEVICE_GATE_TOKEN_MAX_AGE_SECONDS } from '@/lib/device-gate/session';
import { resolveCafeBySlug } from '@/lib/ops/cafes';

const Input = z.object({
  slug: z.string().min(1),
  pairingCode: z.string().min(1),
  label: z.string().min(1).max(120),
  deviceType: z.enum(['mobile_phone', 'tablet', 'desktop', 'kiosk']),
  deviceMode: z.enum(['shared_runtime', 'station_only', 'owner_private']).default('shared_runtime'),
  stationType: z.enum(['barista', 'shisha', 'kitchen']).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid device activation payload.' } }, { status: 400 });
  }

  try {
    const expectedPairingCode = (process.env.AHWA_DEVICE_PAIRING_CODE || process.env.AHWA_INSTALL_TOKEN || '').trim();
    if (expectedPairingCode && parsed.data.pairingCode.trim() !== expectedPairingCode) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_PAIRING_CODE', message: 'Pairing code is invalid.' } }, { status: 403 });
    }

    const cafe = await resolveCafeBySlug(normalizeCafeSlug(parsed.data.slug));
    if (!cafe || !cafe.isActive) {
      return NextResponse.json({ ok: false, error: { code: 'CAFE_NOT_FOUND', message: 'Cafe not found.' } }, { status: 404 });
    }

    const token = encodeDeviceGateSession({
      cafeId: cafe.id,
      cafeSlug: cafe.slug,
      label: parsed.data.label.trim(),
      deviceType: parsed.data.deviceType,
      deviceMode: parsed.data.deviceMode,
      stationType: parsed.data.stationType ?? null,
      activatedAt: new Date().toISOString(),
    });

    const response = NextResponse.json({
      ok: true,
      deviceToken: token,
      gate: {
        tenantId: cafe.id,
        tenantSlug: cafe.slug,
        tenantName: cafe.displayName,
        deviceLabel: parsed.data.label.trim(),
        deviceMode: parsed.data.deviceMode,
      },
    });
    setDeviceTokenCookie(response, token, DEVICE_GATE_TOKEN_MAX_AGE_SECONDS);
    setGateSlugCookie(response, cafe.slug);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DEVICE_ACTIVATION_FAILED';
    return NextResponse.json({ ok: false, error: { code: 'DEVICE_ACTIVATION_FAILED', message } }, { status: 500 });
  }
}
