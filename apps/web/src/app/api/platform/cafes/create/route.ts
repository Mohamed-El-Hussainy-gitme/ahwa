import { mirrorOwnerToOperationalDatabase } from '@/lib/control-plane/runtime-provisioning';
import { createCafeWithOwnerOnControlPlane } from '@/lib/control-plane/create-cafe';
import {
  assertPlatformEnv,
  platformFail,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      cafeSlug?: string;
      cafeDisplayName?: string;
      ownerFullName?: string;
      ownerPhone?: string;
      ownerPassword?: string;
      subscriptionStartsAt?: string;
      subscriptionEndsAt?: string;
      subscriptionGraceDays?: number;
      subscriptionStatus?: 'trial' | 'active' | 'expired' | 'suspended';
      subscriptionAmountPaid?: number | string;
      subscriptionIsComplimentary?: boolean;
      subscriptionNotes?: string;
      databaseKey?: string;
    };

    if (
      !body.cafeSlug?.trim() ||
      !body.cafeDisplayName?.trim() ||
      !body.ownerFullName?.trim() ||
      !body.ownerPhone?.trim()
    ) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe and owner fields are required.');
    }

    if (!body.databaseKey?.trim()) {
      return platformFail(400, 'DATABASE_KEY_REQUIRED', 'An explicit operational database binding is required.');
    }

    const subscriptionAmountPaid = Number(body.subscriptionAmountPaid ?? 0);
    if (!Number.isFinite(subscriptionAmountPaid) || subscriptionAmountPaid < 0) {
      return platformFail(400, 'INVALID_INPUT', 'Subscription amount must be a non-negative number.');
    }

    assertPlatformEnv();

    const created = await createCafeWithOwnerOnControlPlane(session, {
      cafeSlug: body.cafeSlug.trim(),
      cafeDisplayName: body.cafeDisplayName.trim(),
      ownerFullName: body.ownerFullName.trim(),
      ownerPhone: body.ownerPhone.trim(),
      ownerPassword: body.ownerPassword ?? '',
      subscriptionStartsAt: body.subscriptionStartsAt?.trim() || null,
      subscriptionEndsAt: body.subscriptionEndsAt?.trim() || null,
      subscriptionGraceDays: Number.isFinite(body.subscriptionGraceDays) ? Number(body.subscriptionGraceDays) : 0,
      subscriptionStatus: body.subscriptionStatus ?? 'trial',
      subscriptionAmountPaid,
      subscriptionIsComplimentary: body.subscriptionIsComplimentary === true,
      subscriptionNotes: body.subscriptionNotes?.trim() || null,
      databaseKey: body.databaseKey?.trim() || '',
    });

    await mirrorOwnerToOperationalDatabase(created.cafeId, created.ownerUserId);

    return platformOk({
      data: {
        ok: true,
        cafe_id: created.cafeId,
        owner_user_id: created.ownerUserId,
        subscription_id: created.subscriptionId,
        slug: created.slug,
        database_key: created.databaseKey,
        password_state: created.ownerPasswordState,
        password_setup_code: created.passwordSetupCode,
        password_setup_expires_at: created.passwordSetupExpiresAt,
      },
    });
  } catch (error) {
    return platformJsonError(error);
  }
}
