import 'server-only';
import type {
  PlatformDatabaseCapacityState,
  PlatformObservabilitySeverity,
  PlatformOperationalAlert,
  PlatformOperationalDispatchSnapshot,
  PlatformOperationalObservabilityRow,
  PlatformOperationalObservabilitySummary,
  PlatformOperationalOutboxSnapshot,
  PlatformOperationalRuntimeSnapshot,
} from '@ahwa/shared';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { listConfiguredOperationalDatabasesFromEnv } from '@/lib/supabase/env';

const EMPTY_RUNTIME: PlatformOperationalRuntimeSnapshot = {
  open_shift_count: 0,
  active_cafe_count: 0,
  open_session_count: 0,
  pending_item_count: 0,
  ready_item_count: 0,
  waiting_qty: 0,
  ready_qty: 0,
  billable_qty: 0,
  oldest_pending_seconds: null,
  oldest_ready_seconds: null,
  deferred_customer_count: 0,
  deferred_outstanding_amount: 0,
  last_deferred_entry_at: null,
};

const EMPTY_OUTBOX: PlatformOperationalOutboxSnapshot = {
  pending_count: 0,
  inflight_count: 0,
  retrying_count: 0,
  dead_letter_count: 0,
  max_publish_attempts: 0,
  oldest_pending_seconds: null,
  last_published_at: null,
};

const EMPTY_DISPATCH: PlatformOperationalDispatchSnapshot = {
  last_run_at: null,
  last_hour_runs: 0,
  last_hour_claimed: 0,
  last_hour_published: 0,
  last_hour_failed: 0,
  last_hour_dead_lettered: 0,
  last_hour_avg_duration_ms: 0,
};

type ControlPlaneOperationalDatabaseRow = {
  database_key?: string | null;
  display_name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  is_accepting_new_cafes?: boolean | null;
  cafe_count?: number | null;
  total_load_units?: number | null;
  max_load_units?: number | null;
  load_percent?: number | null;
  heavy_cafe_count?: number | null;
  max_cafes?: number | null;
  max_heavy_cafes?: number | null;
  capacity_state?: string | null;
  scale_notes?: string | null;
};

type SnapshotPayload = {
  generated_at?: string | null;
  database_name?: string | null;
  runtime?: Partial<PlatformOperationalRuntimeSnapshot> | null;
  outbox?: Partial<PlatformOperationalOutboxSnapshot> | null;
  dispatch?: Partial<PlatformOperationalDispatchSnapshot> | null;
};

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asCapacityState(value: unknown): PlatformDatabaseCapacityState {
  return value === 'warning' || value === 'critical' || value === 'hot' || value === 'full' || value === 'draining' || value === 'inactive'
    ? value
    : 'healthy';
}

function normalizeRuntime(value: Partial<PlatformOperationalRuntimeSnapshot> | null | undefined): PlatformOperationalRuntimeSnapshot {
  return {
    open_shift_count: asNumber(value?.open_shift_count),
    active_cafe_count: asNumber(value?.active_cafe_count),
    open_session_count: asNumber(value?.open_session_count),
    pending_item_count: asNumber(value?.pending_item_count),
    ready_item_count: asNumber(value?.ready_item_count),
    waiting_qty: asNumber(value?.waiting_qty),
    ready_qty: asNumber(value?.ready_qty),
    billable_qty: asNumber(value?.billable_qty),
    oldest_pending_seconds: asNullableNumber(value?.oldest_pending_seconds),
    oldest_ready_seconds: asNullableNumber(value?.oldest_ready_seconds),
    deferred_customer_count: asNumber(value?.deferred_customer_count),
    deferred_outstanding_amount: asNumber(value?.deferred_outstanding_amount),
    last_deferred_entry_at: asString(value?.last_deferred_entry_at),
  };
}

function normalizeOutbox(value: Partial<PlatformOperationalOutboxSnapshot> | null | undefined): PlatformOperationalOutboxSnapshot {
  return {
    pending_count: asNumber(value?.pending_count),
    inflight_count: asNumber(value?.inflight_count),
    retrying_count: asNumber(value?.retrying_count),
    dead_letter_count: asNumber(value?.dead_letter_count),
    max_publish_attempts: asNumber(value?.max_publish_attempts),
    oldest_pending_seconds: asNullableNumber(value?.oldest_pending_seconds),
    last_published_at: asString(value?.last_published_at),
  };
}

function normalizeDispatch(value: Partial<PlatformOperationalDispatchSnapshot> | null | undefined): PlatformOperationalDispatchSnapshot {
  return {
    last_run_at: asString(value?.last_run_at),
    last_hour_runs: asNumber(value?.last_hour_runs),
    last_hour_claimed: asNumber(value?.last_hour_claimed),
    last_hour_published: asNumber(value?.last_hour_published),
    last_hour_failed: asNumber(value?.last_hour_failed),
    last_hour_dead_lettered: asNumber(value?.last_hour_dead_lettered),
    last_hour_avg_duration_ms: asNumber(value?.last_hour_avg_duration_ms),
  };
}

function envFallbackRows() {
  return listConfiguredOperationalDatabasesFromEnv().map((row) => ({
    database_key: row.databaseKey,
    display_name: row.databaseKey,
    description: 'env-configured operational database',
    is_active: true,
    is_accepting_new_cafes: true,
    cafe_count: 0,
    total_load_units: 0,
    max_load_units: 400,
    load_percent: 0,
    heavy_cafe_count: 0,
    max_cafes: null,
    max_heavy_cafes: null,
    capacity_state: 'healthy',
    scale_notes: null,
  } satisfies ControlPlaneOperationalDatabaseRow));
}

async function loadPolicyRows() {
  const fallback = envFallbackRows();
  try {
    const { data, error } = await controlPlaneAdmin().rpc('control_list_operational_databases');
    if (error || !Array.isArray(data) || !data.length) {
      return fallback;
    }
    return data as ControlPlaneOperationalDatabaseRow[];
  } catch {
    return fallback;
  }
}

function deriveAlerts(
  row: PlatformOperationalObservabilityRow,
): PlatformOperationalAlert[] {
  const alerts: PlatformOperationalAlert[] = [];

  if (!row.configured_in_env) {
    alerts.push({ code: 'env_missing', severity: 'critical', message: 'هذه القاعدة غير معرفة في متغيرات البيئة الحالية.' });
  }

  if (row.error) {
    alerts.push({ code: 'snapshot_unavailable', severity: 'critical', message: row.error });
  }

  if (row.capacity_state === 'full' || row.capacity_state === 'critical' || row.capacity_state === 'hot') {
    alerts.push({ code: 'capacity_critical', severity: 'critical', message: 'سعة الشارد في حالة حرجة وتحتاج توزيعًا جديدًا.' });
  } else if (row.capacity_state === 'warning' || row.capacity_state === 'draining' || row.capacity_state === 'inactive') {
    alerts.push({ code: 'capacity_watch', severity: 'warning', message: 'سياسة السعة لهذا الشارد تحتاج متابعة.' });
  }

  if (row.outbox.dead_letter_count > 0) {
    alerts.push({ code: 'dead_letters', severity: 'critical', message: `يوجد ${row.outbox.dead_letter_count} أحداث ميتة في الـ outbox.` });
  }

  if ((row.outbox.oldest_pending_seconds ?? 0) >= 300) {
    alerts.push({ code: 'outbox_lag_critical', severity: 'critical', message: 'تأخر نشر الأحداث تجاوز 5 دقائق.' });
  } else if ((row.outbox.oldest_pending_seconds ?? 0) >= 60) {
    alerts.push({ code: 'outbox_lag_warning', severity: 'warning', message: 'هناك تأخر ملحوظ في نشر الأحداث.' });
  }

  if (row.outbox.retrying_count > 0 || row.dispatch.last_hour_failed > 0) {
    alerts.push({ code: 'dispatch_failures', severity: 'warning', message: 'هناك محاولات نشر فاشلة تحتاج متابعة.' });
  }

  if (row.runtime.open_shift_count > 0 && row.outbox.pending_count > 0 && !row.dispatch.last_run_at) {
    alerts.push({ code: 'dispatcher_missing', severity: 'warning', message: 'يوجد ضغط تشغيل لكن لم تسجل أي دورة dispatch حديثة.' });
  }

  return alerts;
}

function deriveStatus(alerts: PlatformOperationalAlert[]): PlatformObservabilitySeverity {
  if (alerts.some((alert) => alert.severity === 'critical')) return 'critical';
  if (alerts.some((alert) => alert.severity === 'warning')) return 'warning';
  return 'healthy';
}

async function loadShardSnapshot(databaseKey: string) {
  const { data, error } = await supabaseAdminForDatabase(databaseKey).rpc('ops_get_observability_snapshot');
  if (error) {
    throw error;
  }
  return (data ?? null) as SnapshotPayload | null;
}

function buildRowFromPolicy(policy: ControlPlaneOperationalDatabaseRow, configuredKeys: Set<string>): PlatformOperationalObservabilityRow {
  const databaseKey = asString(policy.database_key) ?? 'unknown';
  const row: PlatformOperationalObservabilityRow = {
    database_key: databaseKey,
    display_name: asString(policy.display_name) ?? databaseKey,
    description: asString(policy.description),
    configured_in_env: configuredKeys.has(databaseKey),
    is_active: policy.is_active !== false,
    is_accepting_new_cafes: policy.is_accepting_new_cafes !== false,
    cafe_count: asNumber(policy.cafe_count),
    total_load_units: asNumber(policy.total_load_units),
    max_load_units: asNumber(policy.max_load_units, 400),
    load_percent: asNumber(policy.load_percent),
    heavy_cafe_count: asNumber(policy.heavy_cafe_count),
    max_cafes: asNullableNumber(policy.max_cafes),
    max_heavy_cafes: asNullableNumber(policy.max_heavy_cafes),
    capacity_state: asCapacityState(policy.capacity_state),
    scale_notes: asString(policy.scale_notes),
    status: 'healthy',
    generated_at: null,
    database_name: null,
    runtime: EMPTY_RUNTIME,
    outbox: EMPTY_OUTBOX,
    dispatch: EMPTY_DISPATCH,
    alerts: [],
    error: null,
  };
  return row;
}

export async function loadPlatformObservabilityOverview() {
  const configured = listConfiguredOperationalDatabasesFromEnv();
  const configuredKeys = new Set(configured.map((item) => item.databaseKey));
  const policies = await loadPolicyRows();
  const byKey = new Map<string, ControlPlaneOperationalDatabaseRow>();
  for (const policy of policies) {
    const key = asString(policy.database_key);
    if (key) byKey.set(key, policy);
  }
  for (const item of configured) {
    if (!byKey.has(item.databaseKey)) {
      byKey.set(item.databaseKey, {
        database_key: item.databaseKey,
        display_name: item.databaseKey,
        description: 'env-configured operational database',
        is_active: true,
        is_accepting_new_cafes: true,
        cafe_count: 0,
        total_load_units: 0,
        max_load_units: 400,
        load_percent: 0,
        heavy_cafe_count: 0,
        max_cafes: null,
        max_heavy_cafes: null,
        capacity_state: 'healthy',
        scale_notes: null,
      });
    }
  }

  const rows = await Promise.all(
    Array.from(byKey.values()).map(async (policy) => {
      const row = buildRowFromPolicy(policy, configuredKeys);
      if (!row.configured_in_env) {
        row.alerts = deriveAlerts(row);
        row.status = deriveStatus(row.alerts);
        return row;
      }

      try {
        const snapshot = await loadShardSnapshot(row.database_key);
        row.generated_at = asString(snapshot?.generated_at);
        row.database_name = asString(snapshot?.database_name);
        row.runtime = normalizeRuntime(snapshot?.runtime);
        row.outbox = normalizeOutbox(snapshot?.outbox);
        row.dispatch = normalizeDispatch(snapshot?.dispatch);
      } catch (error) {
        row.error = error instanceof Error ? error.message : 'تعذر قراءة snapshot من قاعدة التشغيل.';
      }

      row.alerts = deriveAlerts(row);
      row.status = deriveStatus(row.alerts);
      return row;
    }),
  );

  rows.sort((a, b) => {
    const rank = { critical: 0, warning: 1, healthy: 2 } as const;
    const statusDiff = rank[a.status] - rank[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.database_key.localeCompare(b.database_key);
  });

  const summary: PlatformOperationalObservabilitySummary = {
    generated_at: new Date().toISOString(),
    shard_count: rows.length,
    healthy_shard_count: rows.filter((row) => row.status === 'healthy').length,
    warning_shard_count: rows.filter((row) => row.status === 'warning').length,
    critical_shard_count: rows.filter((row) => row.status === 'critical').length,
    total_cafes: rows.reduce((sum, row) => sum + row.cafe_count, 0),
    total_load_units: rows.reduce((sum, row) => sum + row.total_load_units, 0),
    total_max_load_units: rows.reduce((sum, row) => sum + row.max_load_units, 0),
    total_active_cafes: rows.reduce((sum, row) => sum + row.runtime.active_cafe_count, 0),
    total_open_shifts: rows.reduce((sum, row) => sum + row.runtime.open_shift_count, 0),
    total_open_sessions: rows.reduce((sum, row) => sum + row.runtime.open_session_count, 0),
    total_waiting_qty: rows.reduce((sum, row) => sum + row.runtime.waiting_qty, 0),
    total_ready_qty: rows.reduce((sum, row) => sum + row.runtime.ready_qty, 0),
    total_billable_qty: rows.reduce((sum, row) => sum + row.runtime.billable_qty, 0),
    total_outbox_pending: rows.reduce((sum, row) => sum + row.outbox.pending_count, 0),
    total_outbox_inflight: rows.reduce((sum, row) => sum + row.outbox.inflight_count, 0),
    total_dead_letters: rows.reduce((sum, row) => sum + row.outbox.dead_letter_count, 0),
    total_dispatch_published_last_hour: rows.reduce((sum, row) => sum + row.dispatch.last_hour_published, 0),
    total_dispatch_failed_last_hour: rows.reduce((sum, row) => sum + row.dispatch.last_hour_failed, 0),
  };

  return { summary, items: rows };
}
