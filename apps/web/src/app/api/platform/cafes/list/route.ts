import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function GET() {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc('platform_list_cafes');

    if (error) {
      throw error;
    }

    return platformOk({ items: data ?? [] });
  } catch (error) {
    return platformJsonError(error);
  }
}
