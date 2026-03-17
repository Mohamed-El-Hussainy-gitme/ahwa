import { NextRequest, NextResponse } from 'next/server';
import { ApiRouteError, apiJsonError } from '@/app/api/_shared';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { listCafeDatabaseBindings } from '@/lib/control-plane/cafes';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

type MaintenanceAction = 'backfill' | 'reconcile' | 'archive' | 'archive-plan' | 'archive-execute';

type CafeRow = {
  id: string;
  is_active: boolean | null;
  created_at: string | null;
};

type CafeBindingRow = {
  cafeId: string;
  databaseKey: string | null;
};

type CafeMaintenanceTarget = {
  cafeId: string;
  databaseKey: string | null;
  isActive: boolean;
};

type ExecutionBody = {
  action?: string;
  approvalId?: string;
  approvedBy?: string;
  notes?: string;
  databaseKey?: string;
};

function assertCronAuth(request: NextRequest | Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    throw new ApiRouteError('UNAUTHORIZED', 'UNAUTHORIZED', 401);
  }
}

function assertArchiveApprovalSecret(request: NextRequest | Request) {
  const secret = process.env.ARCHIVE_APPROVAL_SECRET;
  const header = request.headers.get('x-archive-approval-secret');
  if (!secret || header !== secret) {
    throw new ApiRouteError('ARCHIVE_APPROVAL_UNAUTHORIZED', 'ARCHIVE_APPROVAL_UNAUTHORIZED', 401);
  }
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function isoDateDaysAgo(daysAgo: number) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

function isPayloadOk(payload: unknown) {
  return !(payload && typeof payload === 'object' && 'ok' in payload && (payload as { ok?: boolean }).ok === false);
}

function normalizeGetAction(rawAction: string | null, dryRun: boolean): Exclude<MaintenanceAction, 'archive-execute'> {
  const value = (rawAction ?? 'backfill') as MaintenanceAction;
  if (value === 'archive' && dryRun) return 'archive-plan';
  if (value === 'archive' && !dryRun) {
    throw new ApiRouteError(
      'ARCHIVE_EXECUTION_REQUIRES_APPROVAL',
      'ARCHIVE_EXECUTION_REQUIRES_APPROVAL',
      400,
    );
  }
  if (value === 'archive-execute') {
    throw new ApiRouteError('INVALID_ACTION', 'INVALID_ACTION', 400);
  }
  if (!['backfill', 'reconcile', 'archive-plan'].includes(value)) {
    throw new ApiRouteError('INVALID_ACTION', 'INVALID_ACTION', 400);
  }
  return value as Exclude<MaintenanceAction, 'archive-execute'>;
}

async function loadCafeMaintenanceTargets(cafeId: string | null, includeInactive: boolean): Promise<CafeMaintenanceTarget[]> {
  const admin = controlPlaneAdmin();
  const [{ data: cafes, error: cafesError }, bindings] = await Promise.all([
    admin.schema('ops').from('cafes').select('id, is_active, created_at').order('created_at', { ascending: true }),
    listCafeDatabaseBindings(),
  ]);

  if (cafesError) throw cafesError;

  const bindingMap = new Map<string, string>();
  for (const row of (bindings as CafeBindingRow[])) {
    const databaseKey = typeof row.databaseKey === 'string' ? row.databaseKey.trim() : '';
    if (row.cafeId && databaseKey) {
      bindingMap.set(String(row.cafeId), databaseKey);
    }
  }

  return ((cafes ?? []) as CafeRow[])
    .filter((row) => !cafeId || String(row.id) === cafeId)
    .filter((row) => includeInactive || !!row.is_active)
    .map((row) => ({
      cafeId: String(row.id),
      databaseKey: bindingMap.get(String(row.id)) ?? null,
      isActive: !!row.is_active,
    }));
}

async function loadKnownOperationalDatabaseKeys(): Promise<string[]> {
  const bindings = await listCafeDatabaseBindings();

  return [...new Set(
    bindings
      .map((row) => row.databaseKey.trim())
      .filter(Boolean),
  )];
}

async function runGetActionForCafe(
  action: Exclude<MaintenanceAction, 'archive-execute'>,
  target: CafeMaintenanceTarget,
  options: {
    startDate: string;
    endDate: string;
    graceDays: number;
    requestedBy: string;
  },
) {
  if (!target.databaseKey) {
    throw new Error('CAFE_DATABASE_UNBOUND');
  }

  const admin = supabaseAdminForDatabase(target.databaseKey);
  if (action === 'backfill') {
    const { data, error } = await admin.rpc('ops_backfill_reporting_history', {
      p_cafe_id: target.cafeId,
      p_start_date: options.startDate,
      p_end_date: options.endDate,
      p_rebuild_deferred_balances: true,
    });
    if (error) throw error;
    return data;
  }

  if (action === 'reconcile') {
    const { data, error } = await admin.rpc('ops_reconcile_reporting_window', {
      p_cafe_id: target.cafeId,
      p_start_date: options.startDate,
      p_end_date: options.endDate,
    });
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin.rpc('ops_request_archive_execution_approval', {
    p_cafe_id: target.cafeId,
    p_grace_days: options.graceDays,
    p_requested_by: options.requestedBy,
    p_request_json: {
      source: 'internal-maintenance-route',
      action: 'archive-plan',
      startDate: options.startDate,
      endDate: options.endDate,
      databaseKey: target.databaseKey,
    },
  });
  if (error) throw error;
  return data;
}

async function executeArchiveApproval(databaseKey: string, approvalId: string, approvedBy: string, notes: string | null) {
  const admin = supabaseAdminForDatabase(databaseKey);
  const { data, error } = await admin.rpc('ops_execute_archive_execution_approval', {
    p_approval_id: approvalId,
    p_approved_by: approvedBy,
    p_request_json: {
      source: 'internal-maintenance-route',
      notes,
      databaseKey,
    },
  });
  if (error) throw error;
  return data;
}

function looksLikeApprovalNotFound(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const values = [record.reason, record.code, record.error]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toUpperCase());

  return values.some((value) => value.includes('NOT_FOUND') || value.includes('UNKNOWN_APPROVAL'));
}

export async function GET(request: NextRequest) {
  try {
    assertCronAuth(request);

    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const action = normalizeGetAction(request.nextUrl.searchParams.get('action'), dryRun);
    const cafeId = request.nextUrl.searchParams.get('cafeId');
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';
    const windowDays = parsePositiveInteger(request.nextUrl.searchParams.get('windowDays'), 35);
    const graceDays = parsePositiveInteger(request.nextUrl.searchParams.get('graceDays'), 14);
    const requestedBy = request.nextUrl.searchParams.get('requestedBy') ?? 'cron';
    const endDate = isoDateDaysAgo(0);
    const startDate = isoDateDaysAgo(windowDays);

    const targets = await loadCafeMaintenanceTargets(cafeId, includeInactive);
    const results: Array<{ cafeId: string; databaseKey: string | null; ok: boolean; result?: unknown; error?: string }> = [];

    const targetsByDatabase = new Map<string, CafeMaintenanceTarget[]>();
    for (const target of targets) {
      if (!target.databaseKey) {
        results.push({
          cafeId: target.cafeId,
          databaseKey: null,
          ok: false,
          error: 'CAFE_DATABASE_UNBOUND',
        });
        continue;
      }

      const group = targetsByDatabase.get(target.databaseKey) ?? [];
      group.push(target);
      targetsByDatabase.set(target.databaseKey, group);
    }

    for (const [databaseKey, databaseTargets] of targetsByDatabase.entries()) {
      for (const target of databaseTargets) {
        try {
          const result = await runGetActionForCafe(action, target, {
            startDate,
            endDate,
            graceDays,
            requestedBy,
          });
          if (!isPayloadOk(result)) {
            const message = result && typeof result === 'object' && 'reason' in result
              ? String((result as { reason?: string }).reason ?? 'ACTION_FAILED')
              : 'ACTION_FAILED';
            throw new Error(message);
          }
          results.push({ cafeId: target.cafeId, databaseKey, ok: true, result });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
          results.push({ cafeId: target.cafeId, databaseKey, ok: false, error: message });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      action,
      cafeCount: targets.length,
      dryRun,
      startDate,
      endDate,
      graceDays,
      results,
    });
  } catch (error) {
    return apiJsonError(error, 400, 'MAINTENANCE_FAILED');
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCronAuth(request);
    assertArchiveApprovalSecret(request);

    const body = (await request.json().catch(() => ({}))) as ExecutionBody;
    const action = (body.action ?? 'archive-execute') as MaintenanceAction;
    if (action !== 'archive-execute') {
      throw new ApiRouteError('INVALID_ACTION', 'INVALID_ACTION', 400);
    }

    const approvalId = (body.approvalId ?? '').trim();
    if (!approvalId) {
      throw new ApiRouteError('APPROVAL_ID_REQUIRED', 'APPROVAL_ID_REQUIRED', 400);
    }

    const approvedBy = (body.approvedBy ?? 'manual').trim() || 'manual';
    const databaseKeys = body.databaseKey?.trim()
      ? [body.databaseKey.trim()]
      : await loadKnownOperationalDatabaseKeys();

    if (!databaseKeys.length) {
      throw new ApiRouteError('NO_OPERATIONAL_DATABASES_CONFIGURED', 'NO_OPERATIONAL_DATABASES_CONFIGURED', 409);
    }

    let lastError: unknown = null;
    for (const databaseKey of databaseKeys) {
      try {
        const result = await executeArchiveApproval(databaseKey, approvalId, approvedBy, body.notes?.trim() ?? null);
        if (looksLikeApprovalNotFound(result)) {
          lastError = new Error('APPROVAL_NOT_FOUND');
          continue;
        }

        const ok = isPayloadOk(result);
        return NextResponse.json(
          {
            ok,
            action,
            approvalId,
            databaseKey,
            result,
          },
          { status: ok ? 200 : 409 },
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('APPROVAL_NOT_FOUND');
  } catch (error) {
    return apiJsonError(error, 400, 'MAINTENANCE_FAILED');
  }
}
