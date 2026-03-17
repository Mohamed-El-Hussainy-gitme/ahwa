import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { mirrorOwnerToOperationalDatabase } from '@/lib/control-plane/runtime-provisioning';
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
      !body.ownerPhone?.trim() ||
      !(body.ownerPassword ?? '').trim()
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

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('platform_create_cafe_with_owner', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_slug: body.cafeSlug.trim(),
      p_cafe_display_name: body.cafeDisplayName.trim(),
      p_owner_full_name: body.ownerFullName.trim(),
      p_owner_phone: body.ownerPhone.trim(),
      p_owner_password: body.ownerPassword,
      p_subscription_starts_at: body.subscriptionStartsAt?.trim() || null,
      p_subscription_ends_at: body.subscriptionEndsAt?.trim() || null,
      p_subscription_grace_days: Number.isFinite(body.subscriptionGraceDays) ? Number(body.subscriptionGraceDays) : 0,
      p_subscription_status: body.subscriptionStatus ?? 'trial',
      p_subscription_amount_paid: subscriptionAmountPaid,
      p_subscription_is_complimentary: body.subscriptionIsComplimentary === true,
      p_subscription_notes: body.subscriptionNotes?.trim() || null,
      p_database_key: body.databaseKey?.trim() || null,
    });

    if (error) {
      throw error;
    }

    const created = data && typeof data === 'object' ? data as { cafe_id?: string | null; owner_user_id?: string | null } : null;
    const cafeId = typeof created?.cafe_id === 'string' ? created.cafe_id.trim() : '';
    const ownerUserId = typeof created?.owner_user_id === 'string' ? created.owner_user_id.trim() : '';

    if (!cafeId || !ownerUserId) {
      throw new Error('CONTROL_PLANE_CREATE_CAFE_RESPONSE_INVALID');
    }

    await mirrorOwnerToOperationalDatabase(cafeId, ownerUserId);

    return platformOk({ data });
  } catch (error) {
    return platformJsonError(error);
  }
}
