import { NextRequest, NextResponse } from 'next/server';
import { ApiRouteError, apiJsonError } from '@/app/api/_shared';
import { adminOps } from '@/app/api/ops/_server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type MaintenanceAction = 'backfill' | 'reconcile' | 'archive' | 'archive-plan' | 'archive-execute';

type CafeRow = { id: string };

type ExecutionBody = {
  action?: string;
  approvalId?: string;
  approvedBy?: string;
  notes?: string;
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

async function loadCafeIds(cafeId: string | null, includeInactive: boolean): Promise<string[]> {
  const admin = adminOps();
  let query = admin.from('cafes').select('id').order('created_at', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  if (cafeId) query = query.eq('id', cafeId).limit(1);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as CafeRow[]).map((row) => String(row.id));
}

async function runGetActionForCafe(
  action: Exclude<MaintenanceAction, 'archive-execute'>,
  cafeId: string,
  options: {
    startDate: string;
    endDate: string;
    graceDays: number;
    requestedBy: string;
  },
) {
  const admin = supabaseAdmin();
  if (action === 'backfill') {
    const { data, error } = await admin.rpc('ops_backfill_reporting_history', {
      p_cafe_id: cafeId,
      p_start_date: options.startDate,
      p_end_date: options.endDate,
      p_rebuild_deferred_balances: true,
    });
    if (error) throw error;
    return data;
  }

  if (action === 'reconcile') {
    const { data, error } = await admin.rpc('ops_reconcile_reporting_window', {
      p_cafe_id: cafeId,
      p_start_date: options.startDate,
      p_end_date: options.endDate,
    });
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin.rpc('ops_request_archive_execution_approval', {
    p_cafe_id: cafeId,
    p_grace_days: options.graceDays,
    p_requested_by: options.requestedBy,
    p_request_json: {
      source: 'internal-maintenance-route',
      action: 'archive-plan',
      startDate: options.startDate,
      endDate: options.endDate,
    },
  });
  if (error) throw error;
  return data;
}

async function executeArchiveApproval(approvalId: string, approvedBy: string, notes: string | null) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('ops_execute_archive_execution_approval', {
    p_approval_id: approvalId,
    p_approved_by: approvedBy,
    p_request_json: {
      source: 'internal-maintenance-route',
      notes,
    },
  });
  if (error) throw error;
  return data;
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

    const cafeIds = await loadCafeIds(cafeId, includeInactive);
    const results: Array<{ cafeId: string; ok: boolean; result?: unknown; error?: string }> = [];

    for (const id of cafeIds) {
      try {
        const result = await runGetActionForCafe(action, id, {
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
        results.push({ cafeId: id, ok: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
        results.push({ cafeId: id, ok: false, error: message });
      }
    }

    return NextResponse.json({
      ok: true,
      action,
      cafeCount: cafeIds.length,
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
    const result = await executeArchiveApproval(approvalId, approvedBy, body.notes?.trim() ?? null);
    const ok = isPayloadOk(result);

    return NextResponse.json(
      {
        ok,
        action,
        approvalId,
        result,
      },
      { status: ok ? 200 : 409 },
    );
  } catch (error) {
    return apiJsonError(error, 400, 'MAINTENANCE_FAILED');
  }
}
