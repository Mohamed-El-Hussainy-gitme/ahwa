import { supabaseAdmin } from '@/lib/supabase/admin';

type RecoveryOrderItemRow = {
  service_session_id: string | null;
  qty_total: number | null;
  qty_submitted: number | null;
  qty_ready: number | null;
  qty_delivered: number | null;
  qty_replacement_delivered: number | null;
  qty_paid: number | null;
  qty_deferred: number | null;
  qty_waived: number | null;
  qty_remade: number | null;
  qty_cancelled: number | null;
};

type RecoverySessionRow = {
  id: string;
  session_label: string | null;
  opened_at: string | null;
};

type RecoveryLockRow = {
  idempotency_key: string | null;
  action_name: string | null;
  created_at: string | null;
};

export type RecoverySessionSummary = {
  id: string;
  label: string;
  openedAt: string | null;
  ageMinutes: number;
  waitingQty: number;
  readyQty: number;
  billableQty: number;
  recoverable: boolean;
};

export type RecoveryState = {
  openShiftId: string | null;
  openSessionsCount: number;
  recoverableSessions: RecoverySessionSummary[];
  staleLocksCount: number;
  staleLocks: Array<{
    key: string;
    actionName: string;
    createdAt: string | null;
    ageSeconds: number;
  }>;
};

function ops() {
  return supabaseAdmin().schema('ops');
}

function toNumber(value: number | string | null | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function minutesSince(value: string | null | undefined) {
  if (!value) return 0;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

function secondsSince(value: string | null | undefined) {
  if (!value) return 0;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / 1000));
}

function computeItemCounts(item: RecoveryOrderItemRow) {
  const qtySubmitted = toNumber(item.qty_submitted);
  const qtyReady = toNumber(item.qty_ready);
  const qtyTotal = toNumber(item.qty_total);
  const qtyCancelled = toNumber(item.qty_cancelled);
  const qtyDelivered = toNumber(item.qty_delivered);
  const qtyReplacementDelivered = toNumber(item.qty_replacement_delivered);
  const qtyPaid = toNumber(item.qty_paid);
  const qtyDeferred = toNumber(item.qty_deferred);
  const qtyWaived = toNumber(item.qty_waived);
  const qtyRemade = toNumber(item.qty_remade);

  const waitingQty =
    Math.max(qtySubmitted - Math.min(qtyReady, qtySubmitted) - qtyCancelled, 0) +
    Math.max(qtyRemade - Math.max(qtyReady - Math.min(qtyReady, qtySubmitted), 0), 0);

  const readyQty =
    Math.max(Math.min(qtyReady, qtyTotal - qtyCancelled) - qtyDelivered, 0) +
    Math.max(qtyReady - Math.min(qtyReady, qtyTotal - qtyCancelled) - qtyReplacementDelivered, 0);

  const billableQty = Math.max(qtyDelivered - qtyPaid - qtyDeferred - qtyWaived, 0);

  return { waitingQty, readyQty, billableQty };
}

async function readOpenShiftId(cafeId: string) {
  const { data, error } = await ops()
    .from('shifts')
    .select('id')
    .eq('cafe_id', cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

async function readOpenSessions(cafeId: string): Promise<RecoverySessionRow[]> {
  const { data, error } = await ops()
    .from('service_sessions')
    .select('id, session_label, opened_at')
    .eq('cafe_id', cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    session_label: row.session_label ? String(row.session_label) : null,
    opened_at: row.opened_at ? String(row.opened_at) : null,
  }));
}

async function readOrderItemsForSessions(cafeId: string, sessionIds: string[]) {
  if (sessionIds.length === 0) return [];

  const { data, error } = await ops()
    .from('order_items')
    .select('service_session_id, qty_total, qty_submitted, qty_ready, qty_delivered, qty_replacement_delivered, qty_paid, qty_deferred, qty_waived, qty_remade, qty_cancelled')
    .eq('cafe_id', cafeId)
    .in('service_session_id', sessionIds);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    service_session_id: row.service_session_id ? String(row.service_session_id) : null,
    qty_total: toNumber(row.qty_total),
    qty_submitted: toNumber(row.qty_submitted),
    qty_ready: toNumber(row.qty_ready),
    qty_delivered: toNumber(row.qty_delivered),
    qty_replacement_delivered: toNumber(row.qty_replacement_delivered),
    qty_paid: toNumber(row.qty_paid),
    qty_deferred: toNumber(row.qty_deferred),
    qty_waived: toNumber(row.qty_waived),
    qty_remade: toNumber(row.qty_remade),
    qty_cancelled: toNumber(row.qty_cancelled),
  }));
}

async function readStaleLocks(cafeId: string, olderThanSeconds = 120): Promise<RecoveryLockRow[]> {
  const threshold = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
  const { data, error } = await ops()
    .from('idempotency_keys')
    .select('idempotency_key, action_name, created_at')
    .eq('cafe_id', cafeId)
    .eq('status', 'pending')
    .lt('created_at', threshold)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    idempotency_key: row.idempotency_key ? String(row.idempotency_key) : null,
    action_name: row.action_name ? String(row.action_name) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  }));
}

function buildSessionSummaries(sessions: RecoverySessionRow[], items: RecoveryOrderItemRow[]) {
  const countsBySession = new Map<string, { waitingQty: number; readyQty: number; billableQty: number }>();

  for (const item of items) {
    if (!item.service_session_id) continue;
    const current = countsBySession.get(item.service_session_id) ?? { waitingQty: 0, readyQty: 0, billableQty: 0 };
    const next = computeItemCounts(item);
    current.waitingQty += next.waitingQty;
    current.readyQty += next.readyQty;
    current.billableQty += next.billableQty;
    countsBySession.set(item.service_session_id, current);
  }

  return sessions.map((session) => {
    const counts = countsBySession.get(session.id) ?? { waitingQty: 0, readyQty: 0, billableQty: 0 };
    return {
      id: session.id,
      label: session.session_label?.trim() || session.id.slice(0, 8),
      openedAt: session.opened_at,
      ageMinutes: minutesSince(session.opened_at),
      waitingQty: counts.waitingQty,
      readyQty: counts.readyQty,
      billableQty: counts.billableQty,
      recoverable: counts.waitingQty === 0 && counts.readyQty === 0 && counts.billableQty === 0,
    } satisfies RecoverySessionSummary;
  });
}

export async function readRecoveryState(cafeId: string): Promise<RecoveryState> {
  const [openShiftId, sessions, staleLocks] = await Promise.all([
    readOpenShiftId(cafeId),
    readOpenSessions(cafeId),
    readStaleLocks(cafeId),
  ]);

  const items = await readOrderItemsForSessions(cafeId, sessions.map((session) => session.id));
  const sessionSummaries = buildSessionSummaries(sessions, items);

  return {
    openShiftId,
    openSessionsCount: sessionSummaries.length,
    recoverableSessions: sessionSummaries.filter((session) => session.recoverable),
    staleLocksCount: staleLocks.length,
    staleLocks: staleLocks.map((lock) => ({
      key: lock.idempotency_key ?? '',
      actionName: lock.action_name ?? 'unknown',
      createdAt: lock.created_at,
      ageSeconds: secondsSince(lock.created_at),
    })),
  };
}

export async function closeRecoverableServiceSession(input: {
  cafeId: string;
  serviceSessionId: string;
  ownerUserId: string;
  notes?: string | null;
}) {
  const sessions = await readOpenSessions(input.cafeId);
  const target = sessions.find((session) => session.id === input.serviceSessionId);
  if (!target) {
    throw new Error('RECOVERY_SESSION_NOT_RECOVERABLE');
  }

  const items = await readOrderItemsForSessions(input.cafeId, [input.serviceSessionId]);
  const summary = buildSessionSummaries([target], items)[0];
  if (!summary?.recoverable) {
    throw new Error('RECOVERY_SESSION_NOT_RECOVERABLE');
  }

  const rpc = await supabaseAdmin().rpc('ops_close_service_session', {
    p_cafe_id: input.cafeId,
    p_service_session_id: input.serviceSessionId,
    p_by_owner_id: input.ownerUserId,
    p_notes: input.notes ?? 'recovery-close-idle-session',
  });

  if (rpc.error) {
    const message = String(rpc.error.message ?? '');
    if (/waiting quantity/i.test(message) || /ready quantity/i.test(message) || /billable quantity/i.test(message)) {
      throw new Error('SESSION_CLOSE_BLOCKED');
    }
    throw rpc.error;
  }

  return rpc.data;
}

export async function releaseStaleIdempotencyLocks(cafeId: string, olderThanSeconds = 120) {
  const staleLocks = await readStaleLocks(cafeId, olderThanSeconds);
  if (staleLocks.length === 0) {
    return { releasedCount: 0 };
  }

  const threshold = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
  const { error } = await ops()
    .from('idempotency_keys')
    .delete()
    .eq('cafe_id', cafeId)
    .eq('status', 'pending')
    .lt('created_at', threshold);

  if (error) throw error;

  return { releasedCount: staleLocks.length };
}
