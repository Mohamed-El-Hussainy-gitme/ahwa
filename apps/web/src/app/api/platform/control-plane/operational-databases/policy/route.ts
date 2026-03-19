import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import {
  assertPlatformEnv,
  platformFail,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    assertPlatformEnv();

    const body = (await request.json().catch(() => ({}))) as {
      databaseKey?: string;
      maxLoadUnits?: number | string | null;
      warningLoadPercent?: number | string | null;
      criticalLoadPercent?: number | string | null;
      maxCafes?: number | string | null;
      maxHeavyCafes?: number | string | null;
      isAcceptingNewCafes?: boolean | null;
      scaleNotes?: string | null;
    };

    const databaseKey = body.databaseKey?.trim().toLowerCase() ?? '';
    if (!databaseKey) {
      return platformFail(400, 'INVALID_INPUT', 'databaseKey is required.');
    }

    const { data, error } = await controlPlaneAdmin().rpc('control_set_operational_database_scale_policy', {
      p_super_admin_user_id: session.superAdminUserId,
      p_database_key: databaseKey,
      p_max_load_units: asNumberOrNull(body.maxLoadUnits),
      p_warning_load_percent: asNumberOrNull(body.warningLoadPercent),
      p_critical_load_percent: asNumberOrNull(body.criticalLoadPercent),
      p_max_cafes: asNumberOrNull(body.maxCafes),
      p_max_heavy_cafes: asNumberOrNull(body.maxHeavyCafes),
      p_is_accepting_new_cafes: typeof body.isAcceptingNewCafes === 'boolean' ? body.isAcceptingNewCafes : null,
      p_scale_notes: typeof body.scaleNotes === 'string' ? body.scaleNotes : null,
    });
    if (error) throw error;

    return platformOk({ data: data ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
