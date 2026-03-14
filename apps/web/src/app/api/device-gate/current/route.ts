import { NextResponse } from 'next/server';
import { getCookieValue, DEVICE_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { decodeDeviceGateSession } from '@/lib/device-gate/session';

export async function GET() {
  const token = await getCookieValue(DEVICE_TOKEN_COOKIE);
  if (!token) {
    return NextResponse.json({ ok: false, error: 'NO_DEVICE_TOKEN' }, { status: 401 });
  }

  const gate = decodeDeviceGateSession(token);
  if (!gate) {
    return NextResponse.json({ ok: false, error: 'INVALID_DEVICE_TOKEN' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    gate: {
      tenantId: gate.cafeId,
      tenantSlug: gate.cafeSlug,
      deviceLabel: gate.label,
      deviceMode: gate.deviceMode,
      stationType: gate.stationType,
      activatedAt: gate.activatedAt,
    },
  });
}
