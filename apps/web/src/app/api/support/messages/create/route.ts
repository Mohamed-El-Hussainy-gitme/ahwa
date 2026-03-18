import { z } from 'zod';
import { NextResponse } from 'next/server';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { assertPlatformEnv, platformJsonError } from '@/app/api/platform/_auth';
import { getCookieValue, RUNTIME_SESSION_COOKIE } from '@/lib/auth/cookies';
import { getEnrichedRuntimeMeFromSessionToken } from '@/lib/runtime/me';

const schema = z.object({
  senderName: z.string().trim().min(2).max(120).optional(),
  senderPhone: z.string().trim().min(5).max(40).optional(),
  cafeName: z.string().trim().min(2).max(120).optional(),
  cafeSlug: z.string().trim().min(1).max(120).optional(),
  issueType: z.string().trim().min(2).max(80),
  message: z.string().trim().min(8).max(4000),
  source: z.enum(['login', 'in_app']).default('login'),
  pagePath: z.string().trim().max(240).optional(),
  requestAccess: z.boolean().optional(),
});

function inferPriority(issueType: string) {
  const value = issueType.toLowerCase();
  if (value.includes('login') || value.includes('تعذر') || value.includes('تعطل') || value.includes('لا يعمل')) return 'high';
  if (value.includes('billing') || value.includes('حساب') || value.includes('وردية')) return 'high';
  if (value.includes('training') || value.includes('onboarding') || value.includes('استفسار')) return 'low';
  return 'normal';
}

export async function POST(request: Request) {
  try {
    assertPlatformEnv();
    const payload = schema.parse(await request.json());
    const admin = controlPlaneAdmin();

    let runtimeMe = null;
    const runtimeToken = await getCookieValue(RUNTIME_SESSION_COOKIE);
    if (runtimeToken) {
      runtimeMe = await getEnrichedRuntimeMeFromSessionToken(runtimeToken).catch(() => null);
    }

    const cafeSlug = payload.cafeSlug?.trim() || runtimeMe?.tenantSlug || null;
    const senderName = payload.senderName?.trim() || runtimeMe?.fullName || null;
    const senderPhone = payload.senderPhone?.trim() || null;

    if (!senderName) {
      return NextResponse.json({ ok: false, error: { code: 'SENDER_NAME_REQUIRED', message: 'الاسم مطلوب.' } }, { status: 400 });
    }
    if (!senderPhone) {
      return NextResponse.json({ ok: false, error: { code: 'SENDER_PHONE_REQUIRED', message: 'رقم الهاتف مطلوب.' } }, { status: 400 });
    }
    if (payload.source === 'login' && !payload.cafeName?.trim() && !cafeSlug) {
      return NextResponse.json({ ok: false, error: { code: 'CAFE_NAME_REQUIRED', message: 'اسم القهوة أو الـ slug مطلوب.' } }, { status: 400 });
    }

    let cafeId: string | null = runtimeMe?.tenantId ?? null;
    let cafeDisplayName = payload.cafeName?.trim() || null;

    if (!cafeId && cafeSlug) {
      const { data: cafe } = await admin
        .schema('ops')
        .from('cafes')
        .select('id,slug,display_name')
        .eq('slug', cafeSlug)
        .maybeSingle();
      cafeId = cafe?.id ?? null;
      cafeDisplayName = cafe?.display_name ?? cafeDisplayName;
    }

    const issueType = payload.issueType.trim();
    const source = payload.source;
    const actorKind =
      runtimeMe?.ownerLabel ??
      runtimeMe?.shiftRole ??
      (runtimeMe?.accountKind === 'owner'
        ? 'owner'
        : runtimeMe?.accountKind === 'employee'
          ? 'staff'
          : 'guest');

    const canRequestSupportAccess =
      source === 'in_app' &&
      !!cafeId &&
      (
        runtimeMe?.accountKind === 'owner' ||
        runtimeMe?.shiftRole === 'supervisor'
      );
    const supportAccessRequested = canRequestSupportAccess && payload.requestAccess === true;
    const nowIso = new Date().toISOString();

    const { data, error } = await admin
      .schema('platform')
      .from('support_messages')
      .insert({
        cafe_id: cafeId,
        cafe_slug_snapshot: cafeSlug,
        cafe_display_name_snapshot: cafeDisplayName,
        sender_name: senderName,
        sender_phone: senderPhone,
        actor_kind: actorKind,
        source,
        page_path: payload.pagePath?.trim() || null,
        issue_type: issueType,
        message: payload.message.trim(),
        status: 'new',
        priority: inferPriority(issueType),
        support_access_requested: supportAccessRequested,
        support_access_status: supportAccessRequested ? 'requested' : 'not_requested',
        support_access_requested_at: supportAccessRequested ? nowIso : null,
        metadata: runtimeMe
          ? {
              runtimeUserId: runtimeMe.userId,
              accountKind: runtimeMe.accountKind,
              ownerLabel: runtimeMe.ownerLabel ?? null,
              shiftRole: runtimeMe.shiftRole ?? null,
              supportAccessRequested,
            }
          : {
              supportAccessRequested,
            },
      })
      .select('id,support_access_requested,support_access_status')
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: {
        id: data.id,
        supportAccessRequested: !!data.support_access_requested,
        supportAccessStatus: data.support_access_status ?? 'not_requested',
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: error.issues[0]?.message ?? 'INVALID_INPUT' } }, { status: 400 });
    }
    return platformJsonError(error);
  }
}
