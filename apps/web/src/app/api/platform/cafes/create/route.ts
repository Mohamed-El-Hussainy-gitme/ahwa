import { supabaseAdmin } from '@/lib/supabase/admin';
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

    assertPlatformEnv();

    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc('platform_create_cafe_with_owner', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_slug: body.cafeSlug.trim(),
      p_cafe_display_name: body.cafeDisplayName.trim(),
      p_owner_full_name: body.ownerFullName.trim(),
      p_owner_phone: body.ownerPhone.trim(),
      p_owner_password: body.ownerPassword,
    });

    if (error) {
      throw error;
    }

    return platformOk({ data });
  } catch (error) {
    return platformJsonError(error);
  }
}
