import { supabaseAdmin } from '@/lib/supabase/admin';
import type {
  BillingSession,
  BillableItem,
  ComplaintItemCandidate,
  ComplaintRecord,
  ComplaintsWorkspace,
  DashboardWorkspace,
  DeferredCustomerLedgerWorkspace,
  DeferredCustomerSummary,
  DeferredLedgerEntry,
  MenuWorkspace,
  OpsProduct,
  OpsSection,
  OpsSessionSummary,
  OpsShift,
  ReadyItem,
  SessionOrderItem,
  StationCode,
  StationQueueItem,
  StationWorkspace,
  WaiterWorkspace,
  BillingWorkspace,
} from '@/lib/ops/types';

export function adminOps() {
  return supabaseAdmin().schema('ops');
}

export function normalizeShift(row: any | null): OpsShift | null {
  if (!row) return null;
  return {
    id: String(row.id),
    kind: String(row.shift_kind ?? row.kind ?? ''),
    status: String(row.status ?? ''),
    openedAt: String(row.opened_at ?? row.openedAt ?? new Date().toISOString()),
  };
}

export async function listBillableRows(cafeId: string): Promise<BillableItem[]> {
  const admin = adminOps();
  const { data } = await admin
    .from('order_items')
    .select('id, service_session_id, unit_price, qty_delivered, qty_paid, qty_deferred, qty_waived, created_at, menu_products!inner(product_name), service_sessions!inner(session_label)')
    .eq('cafe_id', cafeId)
    .order('created_at', { ascending: true });
  return (data ?? [])
    .map((row: any) => {
      const qtyBillable = Math.max(
        Number(row.qty_delivered ?? 0) - Number(row.qty_paid ?? 0) - Number(row.qty_deferred ?? 0) - Number(row.qty_waived ?? 0),
        0,
      );
      return {
        orderItemId: String(row.id),
        serviceSessionId: String(row.service_session_id),
        sessionLabel: String(row.service_sessions?.session_label ?? ''),
        productName: String(row.menu_products?.product_name ?? ''),
        unitPrice: Number(row.unit_price ?? 0),
        qtyBillable,
        qtyDelivered: Number(row.qty_delivered ?? 0),
        qtyPaid: Number(row.qty_paid ?? 0),
        qtyDeferred: Number(row.qty_deferred ?? 0),
        qtyWaived: Number(row.qty_waived ?? 0),
      } satisfies BillableItem;
    })
    .filter((row) => row.qtyBillable > 0);
}

export async function buildMenuWorkspace(cafeId: string): Promise<MenuWorkspace> {
  const admin = adminOps();
  const [{ data: sections, error: sectionsError }, { data: products, error: productsError }] = await Promise.all([
    admin
      .from('menu_sections')
      .select('id, title, station_code, sort_order, is_active')
      .eq('cafe_id', cafeId)
      .order('sort_order', { ascending: true }),
    admin
      .from('menu_products')
      .select('id, section_id, product_name, station_code, unit_price, sort_order, is_active')
      .eq('cafe_id', cafeId)
      .order('section_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (sectionsError) throw sectionsError;
  if (productsError) throw productsError;

  return {
    sections: (sections ?? []).map(
      (row: any) =>
        ({
          id: String(row.id),
          title: String(row.title),
          stationCode: String(row.station_code) as StationCode,
          sortOrder: Number(row.sort_order ?? 0),
          isActive: Boolean(row.is_active),
        }) satisfies OpsSection,
    ),
    products: (products ?? []).map(
      (row: any) =>
        ({
          id: String(row.id),
          sectionId: String(row.section_id),
          name: String(row.product_name),
          stationCode: String(row.station_code) as StationCode,
          unitPrice: Number(row.unit_price ?? 0),
          sortOrder: Number(row.sort_order ?? 0),
          isActive: Boolean(row.is_active),
        }) satisfies OpsProduct,
    ),
  };
}

export async function buildWaiterWorkspace(cafeId: string): Promise<WaiterWorkspace> {
  const admin = adminOps();
  const [{ data: shift }, { data: sessions }, { data: sections }, { data: products }] = await Promise.all([
    admin
      .from('shifts')
      .select('id, shift_kind, status, opened_at')
      .eq('cafe_id', cafeId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('service_sessions')
      .select('id, session_label, status, opened_at')
      .eq('cafe_id', cafeId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false }),
    admin
      .from('menu_sections')
      .select('id, title, station_code, sort_order')
      .eq('cafe_id', cafeId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    admin
      .from('menu_products')
      .select('id, section_id, product_name, station_code, unit_price, sort_order')
      .eq('cafe_id', cafeId)
      .eq('is_active', true)
      .order('section_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  const normalizedShift = normalizeShift(shift);
  const openSessionIds = new Set((sessions ?? []).map((session: any) => String(session.id)));

  let itemRows: any[] = [];
  if (normalizedShift) {
    const { data, error } = await admin
      .from('order_items')
      .select('id, service_session_id, station_code, unit_price, qty_total, qty_ready, qty_delivered, qty_replacement_delivered, qty_paid, qty_deferred, qty_waived, qty_remade, qty_cancelled, created_at, menu_products!inner(product_name), service_sessions!inner(session_label)')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    itemRows = (data ?? []) as any[];
  }

  const sessionItems: SessionOrderItem[] = itemRows
    .filter((row) => openSessionIds.has(String(row.service_session_id ?? '')))
    .map((row: any) => {
      const qtyReady = Number(row.qty_ready ?? 0);
      const qtyTotal = Number(row.qty_total ?? 0);
      const qtyCancelled = Number(row.qty_cancelled ?? 0);
      const qtyDelivered = Number(row.qty_delivered ?? 0);
      const qtyReplacementDelivered = Number(row.qty_replacement_delivered ?? 0);
      const qtyPaid = Number(row.qty_paid ?? 0);
      const qtyDeferred = Number(row.qty_deferred ?? 0);
      const qtyWaived = Number(row.qty_waived ?? 0);
      const qtyRemade = Number(row.qty_remade ?? 0);
      const totalOriginalReady = Math.min(qtyReady, Math.max(qtyTotal - qtyCancelled, 0));
      const qtyReadyForNormalDelivery = Math.max(totalOriginalReady - qtyDelivered, 0);
      const qtyReadyForReplacementDelivery = Math.max(qtyReady - totalOriginalReady - qtyReplacementDelivered, 0);
      return {
        orderItemId: String(row.id),
        serviceSessionId: String(row.service_session_id),
        sessionLabel: String(row.service_sessions?.session_label ?? ''),
        productName: String(row.menu_products?.product_name ?? ''),
        stationCode: String(row.station_code) as StationCode,
        unitPrice: Number(row.unit_price ?? 0),
        qtyTotal,
        qtyReady,
        qtyDelivered,
        qtyReplacementDelivered,
        qtyPaid,
        qtyDeferred,
        qtyWaived,
        qtyCancelled,
        qtyRemade,
        qtyReadyForDelivery: qtyReadyForNormalDelivery + qtyReadyForReplacementDelivery,
        availableRemakeQty: Math.max(qtyDelivered + qtyReplacementDelivered - qtyRemade, 0),
      } satisfies SessionOrderItem;
    });

  const readyItems: ReadyItem[] = sessionItems
    .map((item) => {
      const totalOriginalReady = Math.min(item.qtyReady, Math.max(item.qtyTotal - item.qtyCancelled, 0));
      const qtyReadyForNormalDelivery = Math.max(totalOriginalReady - item.qtyDelivered, 0);
      const qtyReadyForReplacementDelivery = Math.max(item.qtyReady - totalOriginalReady - item.qtyReplacementDelivered, 0);
      const qtyReadyForDelivery = qtyReadyForNormalDelivery + qtyReadyForReplacementDelivery;
      if (qtyReadyForDelivery <= 0) return null;
      return {
        orderItemId: item.orderItemId,
        serviceSessionId: item.serviceSessionId,
        sessionLabel: item.sessionLabel,
        productName: item.productName,
        stationCode: item.stationCode,
        qtyReadyForNormalDelivery,
        qtyReadyForReplacementDelivery,
        qtyReadyForDelivery,
      } satisfies ReadyItem;
    })
    .filter(Boolean) as ReadyItem[];

  const billableMap = new Map<string, number>();
  for (const item of sessionItems) {
    const qtyBillable = Math.max(item.qtyDelivered - item.qtyPaid - item.qtyDeferred - item.qtyWaived, 0);
    billableMap.set(item.serviceSessionId, (billableMap.get(item.serviceSessionId) ?? 0) + qtyBillable);
  }
  const readyMap = new Map<string, number>();
  for (const item of readyItems) {
    readyMap.set(item.serviceSessionId, (readyMap.get(item.serviceSessionId) ?? 0) + item.qtyReadyForDelivery);
  }

  return {
    shift: normalizedShift,
    sessions: (sessions ?? []).map(
      (s: any) =>
        ({
          id: String(s.id),
          label: String(s.session_label),
          status: String(s.status),
          openedAt: String(s.opened_at),
          billableCount: billableMap.get(String(s.id)) ?? 0,
          readyCount: readyMap.get(String(s.id)) ?? 0,
        }) satisfies OpsSessionSummary,
    ),
    sections: (sections ?? []).map(
      (s: any) =>
        ({ id: String(s.id), title: String(s.title), stationCode: String(s.station_code) as StationCode, sortOrder: Number(s.sort_order ?? 0) }) satisfies OpsSection,
    ),
    products: (products ?? []).map(
      (p: any) =>
        ({ id: String(p.id), sectionId: String(p.section_id), name: String(p.product_name), stationCode: String(p.station_code) as StationCode, unitPrice: Number(p.unit_price ?? 0), sortOrder: Number(p.sort_order ?? 0) }) satisfies OpsProduct,
    ),
    readyItems,
    sessionItems,
  };
}

export async function buildStationWorkspace(cafeId: string, stationCode: StationCode): Promise<StationWorkspace> {
  const admin = adminOps();
  const [{ data: shift }, { data: rows }] = await Promise.all([
    admin.from('shifts').select('id, shift_kind, status, opened_at').eq('cafe_id', cafeId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    admin
      .from('order_items')
      .select('id, service_session_id, station_code, qty_total, qty_submitted, qty_ready, qty_delivered, qty_replacement_delivered, qty_remade, qty_cancelled, created_at, menu_products!inner(product_name), service_sessions!inner(session_label)')
      .eq('cafe_id', cafeId)
      .eq('station_code', stationCode)
      .order('created_at', { ascending: true }),
  ]);
  const queue: StationQueueItem[] = (rows ?? [])
    .map((row: any) => {
      const qtyWaitingOriginal = Math.max(
        Number(row.qty_submitted ?? 0) - Math.min(Number(row.qty_ready ?? 0), Number(row.qty_submitted ?? 0)) - Number(row.qty_cancelled ?? 0),
        0,
      );
      const qtyWaitingReplacement = Math.max(
        Number(row.qty_remade ?? 0) - Math.max(Number(row.qty_ready ?? 0) - Math.min(Number(row.qty_ready ?? 0), Number(row.qty_submitted ?? 0)), 0),
        0,
      );
      const qtyWaiting = qtyWaitingOriginal + qtyWaitingReplacement;
      return {
        orderItemId: String(row.id),
        serviceSessionId: String(row.service_session_id),
        sessionLabel: String(row.service_sessions?.session_label ?? ''),
        productName: String(row.menu_products?.product_name ?? ''),
        stationCode: String(row.station_code) as StationCode,
        qtyWaitingOriginal,
        qtyWaitingReplacement,
        qtyWaiting,
        qtyReady: Number(row.qty_ready ?? 0),
        qtyDelivered: Number(row.qty_delivered ?? 0),
        qtyReplacementDelivered: Number(row.qty_replacement_delivered ?? 0),
        createdAt: String(row.created_at),
      };
    })
    .filter((row) => row.qtyWaiting > 0);
  return { shift: normalizeShift(shift), stationCode, queue };
}

export async function buildBillingWorkspace(cafeId: string): Promise<BillingWorkspace> {
  const admin = adminOps();
  const [shift, items, deferredNamesRows] = await Promise.all([
    admin.from('shifts').select('id, shift_kind, status, opened_at').eq('cafe_id', cafeId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    listBillableRows(cafeId),
    admin.from('deferred_ledger_entries').select('debtor_name').eq('cafe_id', cafeId),
  ]);
  const bySession = new Map<string, BillingSession>();
  for (const item of items) {
    const key = item.serviceSessionId;
    const current = bySession.get(key) ?? {
      sessionId: item.serviceSessionId,
      sessionLabel: item.sessionLabel,
      items: [],
      totalBillableAmount: 0,
      totalBillableQty: 0,
    };
    current.items.push(item);
    current.totalBillableQty += item.qtyBillable;
    current.totalBillableAmount += item.qtyBillable * item.unitPrice;
    bySession.set(key, current);
  }
  const deferredNames = Array.from(
    new Set((deferredNamesRows.data ?? []).map((r: any) => String(r.debtor_name)).filter(Boolean)),
  );
  return { shift: normalizeShift(shift.data ?? null), sessions: Array.from(bySession.values()), deferredNames };
}

export async function buildDeferredCustomersWorkspace(cafeId: string): Promise<DeferredCustomerSummary[]> {
  const admin = adminOps();
  const { data, error } = await admin
    .from('deferred_ledger_entries')
    .select('id, debtor_name, entry_kind, amount, created_at')
    .eq('cafe_id', cafeId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const byName = new Map<string, DeferredCustomerSummary>();
  for (const row of data ?? []) {
    const debtorName = String((row as any).debtor_name ?? '').trim();
    if (!debtorName) continue;
    const amount = Number((row as any).amount ?? 0);
    const entryKind = String((row as any).entry_kind ?? '');
    const createdAt = String((row as any).created_at ?? '');
    const current = byName.get(debtorName) ?? {
      id: encodeURIComponent(debtorName),
      debtorName,
      balance: 0,
      debtTotal: 0,
      repaymentTotal: 0,
      lastEntryAt: createdAt || null,
      entryCount: 0,
    };

    current.entryCount += 1;
    if (!current.lastEntryAt || createdAt > current.lastEntryAt) {
      current.lastEntryAt = createdAt;
    }
    if (entryKind === 'debt') {
      current.debtTotal += amount;
      current.balance += amount;
    } else if (entryKind === 'repayment') {
      current.repaymentTotal += amount;
      current.balance -= amount;
    }
    byName.set(debtorName, current);
  }

  return Array.from(byName.values()).sort(
    (left, right) =>
      right.balance - left.balance ||
      (right.lastEntryAt ?? '').localeCompare(left.lastEntryAt ?? '') ||
      left.debtorName.localeCompare(right.debtorName, 'ar'),
  );
}

export async function buildDeferredCustomerLedgerWorkspace(
  cafeId: string,
  debtorName: string,
): Promise<DeferredCustomerLedgerWorkspace> {
  const admin = adminOps();
  const { data, error } = await admin
    .from('deferred_ledger_entries')
    .select('id, debtor_name, entry_kind, amount, notes, created_at, payment_id, service_session_id, by_staff_id, by_owner_id')
    .eq('cafe_id', cafeId)
    .eq('debtor_name', debtorName)
    .order('created_at', { ascending: false });

  if (error) throw error;

  let balance = 0;
  const orderedAsc = [...(data ?? [])].reverse();
  for (const row of orderedAsc) {
    const amount = Number((row as any).amount ?? 0);
    const entryKind = String((row as any).entry_kind ?? '');
    if (entryKind === 'debt') balance += amount;
    if (entryKind === 'repayment') balance -= amount;
  }

  const entries: DeferredLedgerEntry[] = (data ?? []).map(
    (row: any) =>
      ({
        id: String(row.id),
        debtorName: String(row.debtor_name),
        entryKind: String(row.entry_kind) as DeferredLedgerEntry['entryKind'],
        amount: Number(row.amount ?? 0),
        notes: row.notes ? String(row.notes) : null,
        createdAt: String(row.created_at),
        paymentId: row.payment_id ? String(row.payment_id) : null,
        serviceSessionId: row.service_session_id ? String(row.service_session_id) : null,
        actorLabel: row.by_owner_id ? 'owner' : row.by_staff_id ? 'staff' : null,
      }) satisfies DeferredLedgerEntry,
  );

  return { debtorName, balance, entries };
}

export async function buildComplaintsWorkspace(cafeId: string): Promise<ComplaintsWorkspace> {
  const admin = adminOps();
  const { data: shift } = await admin
    .from('shifts')
    .select('id, shift_kind, status, opened_at')
    .eq('cafe_id', cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const normalizedShift = normalizeShift(shift);
  if (!normalizedShift) {
    return { shift: null, sessions: [], items: [], complaints: [], itemIssues: [] };
  }

  const [
    { data: sessionRows, error: sessionError },
    { data: itemRows, error: itemError },
    { data: complaintRows, error: complaintError },
    { data: issueRows, error: issueError },
  ] = await Promise.all([
    admin
      .from('service_sessions')
      .select('id, session_label, opened_at')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .order('opened_at', { ascending: false }),
    admin
      .from('order_items')
      .select('id, service_session_id, station_code, unit_price, qty_total, qty_delivered, qty_replacement_delivered, qty_paid, qty_deferred, qty_waived, qty_remade, qty_cancelled, menu_products!inner(product_name), service_sessions!inner(session_label)')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .order('created_at', { ascending: false }),
    admin
      .from('complaints')
      .select('id, order_item_id, service_session_id, station_code, complaint_kind, complaint_scope, status, resolution_kind, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label), order_items(menu_products(product_name))')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .eq('complaint_scope', 'general')
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('order_item_issues')
      .select('id, order_item_id, service_session_id, station_code, issue_kind, action_kind, status, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label), order_items!inner(menu_products(product_name))')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (sessionError) throw sessionError;
  if (itemError) throw itemError;
  if (complaintError) throw complaintError;
  if (issueError) throw issueError;

  const sessions = (sessionRows ?? []).map(
    (row: any) => ({ id: String(row.id), label: String(row.session_label ?? '') }),
  );

  const items: ComplaintItemCandidate[] = (itemRows ?? [])
    .map((row: any) => {
      const availableCancelQty = Math.max(Number(row.qty_total ?? 0) - Number(row.qty_cancelled ?? 0) - Number(row.qty_delivered ?? 0), 0);
      const availableRemakeQty = Math.max(Number(row.qty_delivered ?? 0) + Number(row.qty_replacement_delivered ?? 0) - Number(row.qty_remade ?? 0), 0);
      const availableWaiveQty = Math.max(Number(row.qty_delivered ?? 0) - Number(row.qty_paid ?? 0) - Number(row.qty_deferred ?? 0) - Number(row.qty_waived ?? 0), 0);
      return {
        orderItemId: String(row.id),
        serviceSessionId: String(row.service_session_id),
        sessionLabel: String(row.service_sessions?.session_label ?? ''),
        productName: String(row.menu_products?.product_name ?? ''),
        stationCode: String(row.station_code) as StationCode,
        unitPrice: Number(row.unit_price ?? 0),
        availableCancelQty,
        availableRemakeQty,
        availableWaiveQty,
        qtyDelivered: Number(row.qty_delivered ?? 0),
        qtyReplacementDelivered: Number(row.qty_replacement_delivered ?? 0),
        qtyPaid: Number(row.qty_paid ?? 0),
        qtyDeferred: Number(row.qty_deferred ?? 0),
        qtyWaived: Number(row.qty_waived ?? 0),
      } satisfies ComplaintItemCandidate;
    })
    .filter((item) => item.availableCancelQty > 0 || item.availableRemakeQty > 0 || item.availableWaiveQty > 0);

  const complaints: ComplaintRecord[] = (complaintRows ?? []).map((row: any) => {
    const orderItemRef = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    const menuProductRef = Array.isArray(orderItemRef?.menu_products) ? orderItemRef.menu_products[0] : orderItemRef?.menu_products;
    return {
      id: String(row.id),
      orderItemId: row.order_item_id ? String(row.order_item_id) : null,
      serviceSessionId: String(row.service_session_id),
      sessionLabel: String(row.service_sessions?.session_label ?? ''),
      productName: menuProductRef?.product_name ? String(menuProductRef.product_name) : null,
      stationCode: row.station_code ? (String(row.station_code) as StationCode) : null,
      complaintKind: String(row.complaint_kind) as ComplaintRecord['complaintKind'],
      status: String(row.status) as ComplaintRecord['status'],
      resolutionKind: row.resolution_kind && String(row.resolution_kind) === 'dismissed'
        ? 'dismissed'
        : row.status === 'resolved'
          ? 'resolved'
          : null,
      requestedQuantity: row.requested_quantity == null ? null : Number(row.requested_quantity),
      resolvedQuantity: row.resolved_quantity == null ? null : Number(row.resolved_quantity),
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      createdByLabel: row.created_by_owner_id ? 'owner' : row.created_by_staff_id ? 'staff' : null,
      resolvedByLabel: row.resolved_by_owner_id ? 'owner' : row.resolved_by_staff_id ? 'staff' : null,
    } satisfies ComplaintRecord;
  });

  const itemIssues = (issueRows ?? []).map((row: any) => {
    const orderItemRef = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    const menuProductRef = Array.isArray(orderItemRef?.menu_products) ? orderItemRef.menu_products[0] : orderItemRef?.menu_products;
    return {
      id: String(row.id),
      orderItemId: String(row.order_item_id),
      serviceSessionId: String(row.service_session_id),
      sessionLabel: String(row.service_sessions?.session_label ?? ''),
      productName: String(menuProductRef?.product_name ?? ''),
      stationCode: row.station_code ? (String(row.station_code) as StationCode) : null,
      issueKind: String(row.issue_kind ?? 'other') as ComplaintsWorkspace['itemIssues'][number]['issueKind'],
      actionKind: String(row.action_kind ?? 'note') as ComplaintsWorkspace['itemIssues'][number]['actionKind'],
      status: String(row.status ?? 'logged') as ComplaintsWorkspace['itemIssues'][number]['status'],
      requestedQuantity: row.requested_quantity == null ? null : Number(row.requested_quantity),
      resolvedQuantity: row.resolved_quantity == null ? null : Number(row.resolved_quantity),
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      createdByLabel: row.created_by_owner_id ? 'owner' : row.created_by_staff_id ? 'staff' : null,
      resolvedByLabel: row.resolved_by_owner_id ? 'owner' : row.resolved_by_staff_id ? 'staff' : null,
    } satisfies ComplaintsWorkspace['itemIssues'][number];
  });

  return { shift: normalizedShift, sessions, items, complaints, itemIssues };
}

export async function buildDashboardWorkspace(cafeId: string): Promise<DashboardWorkspace> {
  const [waiter, stationBarista, stationShisha, billing] = await Promise.all([
    buildWaiterWorkspace(cafeId),
    buildStationWorkspace(cafeId, 'barista'),
    buildStationWorkspace(cafeId, 'shisha'),
    buildBillingWorkspace(cafeId),
  ]);
  const admin = adminOps();
  const { data: deferredRows } = await admin.from('deferred_ledger_entries').select('entry_kind, amount').eq('cafe_id', cafeId);
  let deferredOutstanding = 0;
  for (const row of deferredRows ?? []) {
    const amount = Number((row as any).amount ?? 0);
    const kind = String((row as any).entry_kind ?? '');
    deferredOutstanding += kind === 'debt' ? amount : kind === 'repayment' ? -amount : 0;
  }
  return {
    shift: waiter.shift,
    openSessions: waiter.sessions.length,
    waitingBarista: stationBarista.queue.reduce((sum, item) => sum + item.qtyWaiting, 0),
    waitingShisha: stationShisha.queue.reduce((sum, item) => sum + item.qtyWaiting, 0),
    readyForDelivery: waiter.readyItems.reduce((sum, item) => sum + item.qtyReadyForDelivery, 0),
    billableQty: billing.sessions.reduce((sum, session) => sum + session.totalBillableQty, 0),
    deferredOutstanding,
  };
}
