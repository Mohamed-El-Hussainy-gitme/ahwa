import { supabaseAdmin } from '@/lib/supabase/admin';
import type {
  ComplaintRecord,
  DeferredCustomerSummary,
  ItemIssueRecord,
  PeriodReport,
  ProductReportRow,
  ReportBusinessDayRow,
  ReportComplaintEntry,
  ReportItemIssueEntry,
  ReportPeriodKey,
  ReportsWorkspace,
  ReportShiftRow,
  ReportTotals,
  StaffPerformanceRow,
  StationCode,
} from '@/lib/ops/types';
import { buildDeferredCustomersWorkspace } from '@/app/api/ops/_server';

type ShiftRow = {
  id: string;
  shift_kind: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  business_date: string | null;
};
type NamedActorRow = { id: string; full_name: string | null };
type RawMenuProductRef = { id: string; product_name: string | null };
type ItemRow = {
  shift_id: string;
  station_code: string | null;
  unit_price: number | string | null;
  qty_submitted: number | string | null;
  qty_ready: number | string | null;
  qty_delivered: number | string | null;
  qty_replacement_delivered: number | string | null;
  qty_paid: number | string | null;
  qty_deferred: number | string | null;
  qty_remade: number | string | null;
  qty_cancelled: number | string | null;
  qty_waived: number | string | null;
  menu_products: RawMenuProductRef | RawMenuProductRef[] | null;
};
type PaymentRow = {
  shift_id: string;
  payment_kind: string | null;
  total_amount: number | string | null;
  by_staff_id: string | null;
  by_owner_id: string | null;
};
type SessionRow = { shift_id: string; status: string | null };
type ComplaintDetailRow = {
  shift_id: string;
  id: string;
  order_item_id: string | null;
  service_session_id: string;
  station_code: string | null;
  complaint_kind: string | null;
  complaint_scope: string | null;
  status: string | null;
  resolution_kind: string | null;
  requested_quantity: number | string | null;
  resolved_quantity: number | string | null;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  created_by_staff_id: string | null;
  created_by_owner_id: string | null;
  resolved_by_staff_id: string | null;
  resolved_by_owner_id: string | null;
  service_sessions: { session_label: string | null } | { session_label: string | null }[] | null;
};
type ItemIssueDetailRow = {
  shift_id: string;
  id: string;
  order_item_id: string;
  service_session_id: string;
  station_code: string | null;
  issue_kind: string | null;
  action_kind: string | null;
  status: string | null;
  requested_quantity: number | string | null;
  resolved_quantity: number | string | null;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  created_by_staff_id: string | null;
  created_by_owner_id: string | null;
  resolved_by_staff_id: string | null;
  resolved_by_owner_id: string | null;
  service_sessions: { session_label: string | null } | { session_label: string | null }[] | null;
  order_items: { menu_products: { product_name: string | null } | { product_name: string | null }[] | null } | { menu_products: { product_name: string | null } | { product_name: string | null }[] | null }[] | null;
};
type FulfillmentAggRow = {
  shift_id: string;
  event_code: string | null;
  quantity: number | string | null;
  by_staff_id: string | null;
  by_owner_id: string | null;
};
type SnapshotRow = { shift_id: string; snapshot_json: unknown };
type ActorMaps = { staffNames: Map<string, string>; ownerNames: Map<string, string> };

type AggregateMaps = {
  shiftRowsById: Map<string, ReportShiftRow>;
  productsByShift: Map<string, Map<string, ProductReportRow>>;
  staffByShift: Map<string, Map<string, StaffPerformanceRow>>;
  complaintsByShift: Map<string, ReportComplaintEntry[]>;
  itemIssuesByShift: Map<string, ReportItemIssueEntry[]>;
};

function adminOps() {
  return supabaseAdmin().schema('ops');
}

function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function toDateValue(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function formatDateValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfWeek(date: string): string {
  const value = toDateValue(date);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return formatDateValue(value);
}

function startOfMonth(date: string): string {
  const value = toDateValue(date);
  value.setUTCDate(1);
  return formatDateValue(value);
}

function startOfYear(date: string): string {
  const value = toDateValue(date);
  value.setUTCMonth(0, 1);
  return formatDateValue(value);
}

function inDateRange(value: string | null, startDate: string, endDate: string): boolean {
  return !!value && value >= startDate && value <= endDate;
}

function emptyTotals(): ReportTotals {
  return {
    shiftCount: 0,
    submittedQty: 0,
    readyQty: 0,
    deliveredQty: 0,
    replacementDeliveredQty: 0,
    paidQty: 0,
    deferredQty: 0,
    remadeQty: 0,
    cancelledQty: 0,
    waivedQty: 0,
    netSales: 0,
    cashSales: 0,
    deferredSales: 0,
    repaymentTotal: 0,
    complaintTotal: 0,
    complaintOpen: 0,
    complaintResolved: 0,
    complaintDismissed: 0,
    complaintRemake: 0,
    complaintCancel: 0,
    complaintWaive: 0,
    itemIssueTotal: 0,
    itemIssueNote: 0,
    itemIssueRemake: 0,
    itemIssueCancel: 0,
    itemIssueWaive: 0,
    openSessions: 0,
    closedSessions: 0,
    totalSessions: 0,
  };
}

function createShiftRow(row: ShiftRow): ReportShiftRow {
  return {
    shiftId: row.id,
    kind: row.shift_kind,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    businessDate: row.business_date,
    ...emptyTotals(),
    shiftCount: 1,
  };
}

function addTotals(target: ReportTotals, source: ReportTotals) {
  target.shiftCount += source.shiftCount;
  target.submittedQty += source.submittedQty;
  target.readyQty += source.readyQty;
  target.deliveredQty += source.deliveredQty;
  target.replacementDeliveredQty += source.replacementDeliveredQty;
  target.paidQty += source.paidQty;
  target.deferredQty += source.deferredQty;
  target.remadeQty += source.remadeQty;
  target.cancelledQty += source.cancelledQty;
  target.waivedQty += source.waivedQty;
  target.netSales += source.netSales;
  target.cashSales += source.cashSales;
  target.deferredSales += source.deferredSales;
  target.repaymentTotal += source.repaymentTotal;
  target.complaintTotal += source.complaintTotal;
  target.complaintOpen += source.complaintOpen;
  target.complaintResolved += source.complaintResolved;
  target.complaintDismissed += source.complaintDismissed;
  target.complaintRemake += source.complaintRemake;
  target.complaintCancel += source.complaintCancel;
  target.complaintWaive += source.complaintWaive;
  target.itemIssueTotal += source.itemIssueTotal;
  target.itemIssueNote += source.itemIssueNote;
  target.itemIssueRemake += source.itemIssueRemake;
  target.itemIssueCancel += source.itemIssueCancel;
  target.itemIssueWaive += source.itemIssueWaive;
  target.openSessions += source.openSessions;
  target.closedSessions += source.closedSessions;
  target.totalSessions += source.totalSessions;
}

function createProductRow(productId: string, productName: string, stationCode: StationCode): ProductReportRow {
  return {
    productId,
    productName,
    stationCode,
    qtySubmitted: 0,
    qtyReady: 0,
    qtyDelivered: 0,
    qtyReplacementDelivered: 0,
    qtyPaid: 0,
    qtyDeferred: 0,
    qtyRemade: 0,
    qtyCancelled: 0,
    qtyWaived: 0,
    grossSales: 0,
    netSales: 0,
  };
}

function mergeProductRows(target: ProductReportRow, source: ProductReportRow) {
  target.qtySubmitted += source.qtySubmitted;
  target.qtyReady += source.qtyReady;
  target.qtyDelivered += source.qtyDelivered;
  target.qtyReplacementDelivered += source.qtyReplacementDelivered;
  target.qtyPaid += source.qtyPaid;
  target.qtyDeferred += source.qtyDeferred;
  target.qtyRemade += source.qtyRemade;
  target.qtyCancelled += source.qtyCancelled;
  target.qtyWaived += source.qtyWaived;
  target.grossSales += source.grossSales;
  target.netSales += source.netSales;
}

function createStaffRow(actorLabel: string): StaffPerformanceRow {
  return {
    actorLabel,
    submittedQty: 0,
    readyQty: 0,
    deliveredQty: 0,
    replacementDeliveredQty: 0,
    remadeQty: 0,
    cancelledQty: 0,
    waivedQty: 0,
    paymentTotal: 0,
    cashSales: 0,
    deferredSales: 0,
    repaymentTotal: 0,
    complaintCount: 0,
    itemIssueCount: 0,
  };
}

function mergeStaffRows(target: StaffPerformanceRow, source: StaffPerformanceRow) {
  target.submittedQty += source.submittedQty;
  target.readyQty += source.readyQty;
  target.deliveredQty += source.deliveredQty;
  target.replacementDeliveredQty += source.replacementDeliveredQty;
  target.remadeQty += source.remadeQty;
  target.cancelledQty += source.cancelledQty;
  target.waivedQty += source.waivedQty;
  target.paymentTotal += source.paymentTotal;
  target.cashSales += source.cashSales;
  target.deferredSales += source.deferredSales;
  target.repaymentTotal += source.repaymentTotal;
  target.complaintCount += source.complaintCount;
  target.itemIssueCount += source.itemIssueCount;
}

function sortProducts(rows: ProductReportRow[]): ProductReportRow[] {
  return [...rows].sort(
    (left, right) =>
      right.netSales - left.netSales ||
      right.qtyDelivered - left.qtyDelivered ||
      right.qtyReplacementDelivered - left.qtyReplacementDelivered ||
      left.productName.localeCompare(right.productName, 'ar'),
  );
}

function sortStaff(rows: StaffPerformanceRow[]): StaffPerformanceRow[] {
  return [...rows].sort(
    (left, right) =>
      right.paymentTotal - left.paymentTotal ||
      right.deliveredQty - left.deliveredQty ||
      right.remadeQty - left.remadeQty ||
      left.actorLabel.localeCompare(right.actorLabel, 'ar'),
  );
}

function sortShifts(rows: ReportShiftRow[]): ReportShiftRow[] {
  return [...rows].sort(
    (left, right) =>
      (right.businessDate ?? '').localeCompare(left.businessDate ?? '') ||
      right.openedAt.localeCompare(left.openedAt),
  );
}

function actorLabelFromIds(
  row: { by_staff_id?: string | null; by_owner_id?: string | null },
  maps: ActorMaps,
): string | null {
  if (row.by_owner_id) return maps.ownerNames.get(String(row.by_owner_id)) ?? 'owner';
  if (row.by_staff_id) return maps.staffNames.get(String(row.by_staff_id)) ?? 'staff';
  return null;
}

function createEmptyDayRow(businessDate: string): ReportBusinessDayRow {
  return { businessDate, ...emptyTotals() };
}

function buildPeriodReport(input: {
  key: ReportPeriodKey;
  label: string;
  startDate: string;
  endDate: string;
  shiftRows: ReportShiftRow[];
  productsByShift: Map<string, Map<string, ProductReportRow>>;
  staffByShift: Map<string, Map<string, StaffPerformanceRow>>;
  complaintsByShift: Map<string, ReportComplaintEntry[]>;
  itemIssuesByShift: Map<string, ReportItemIssueEntry[]>;
}): PeriodReport {
  const shifts = sortShifts(
    input.shiftRows.filter((row) => inDateRange(row.businessDate, input.startDate, input.endDate)),
  );
  const totals = emptyTotals();
  const daysByDate = new Map<string, ReportBusinessDayRow>();
  const productsById = new Map<string, ProductReportRow>();
  const staffByLabel = new Map<string, StaffPerformanceRow>();
  const complaints: ReportComplaintEntry[] = [];
  const itemIssues: ReportItemIssueEntry[] = [];

  for (const row of shifts) {
    addTotals(totals, row);
    if (row.businessDate) {
      const dayRow = daysByDate.get(row.businessDate) ?? createEmptyDayRow(row.businessDate);
      addTotals(dayRow, row);
      daysByDate.set(row.businessDate, dayRow);
    }

    for (const product of input.productsByShift.get(row.shiftId)?.values() ?? []) {
      const current = productsById.get(product.productId) ?? createProductRow(product.productId, product.productName, product.stationCode);
      mergeProductRows(current, product);
      productsById.set(product.productId, current);
    }

    for (const staff of input.staffByShift.get(row.shiftId)?.values() ?? []) {
      const current = staffByLabel.get(staff.actorLabel) ?? createStaffRow(staff.actorLabel);
      mergeStaffRows(current, staff);
      staffByLabel.set(staff.actorLabel, current);
    }

    complaints.push(...(input.complaintsByShift.get(row.shiftId) ?? []));
    itemIssues.push(...(input.itemIssuesByShift.get(row.shiftId) ?? []));
  }

  return {
    key: input.key,
    label: input.label,
    startDate: input.startDate,
    endDate: input.endDate,
    totals,
    days: Array.from(daysByDate.values()).sort((left, right) => right.businessDate.localeCompare(left.businessDate)),
    shifts,
    products: sortProducts(Array.from(productsById.values())),
    staff: sortStaff(Array.from(staffByLabel.values())),
    complaints: sortComplaintEntries(complaints).slice(0, 80),
    itemIssues: sortComplaintEntries(itemIssues).slice(0, 80),
  };
}

async function loadActorMaps(cafeId: string): Promise<ActorMaps> {
  const admin = adminOps();
  const [{ data: staffRows, error: staffError }, { data: ownerRows, error: ownerError }] = await Promise.all([
    admin.from('staff_members').select('id, full_name').eq('cafe_id', cafeId),
    admin.from('owner_users').select('id, full_name').eq('cafe_id', cafeId),
  ]);
  if (staffError) throw staffError;
  if (ownerError) throw ownerError;
  return {
    staffNames: new Map(((staffRows ?? []) as NamedActorRow[]).map((row) => [String(row.id), String(row.full_name ?? '')])),
    ownerNames: new Map(((ownerRows ?? []) as NamedActorRow[]).map((row) => [String(row.id), String(row.full_name ?? '')])),
  };
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function sortComplaintEntries<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function parseSnapshotShiftRow(snapshot: any, fallback: ShiftRow): ReportShiftRow {
  const shift = snapshot?.shift ?? {};
  const totals = snapshot?.totals ?? {};
  const sessions = snapshot?.sessions ?? {};
  return {
    shiftId: toStringValue(shift.shift_id, fallback.id),
    kind: toStringValue(shift.shift_kind, fallback.shift_kind),
    status: toStringValue(shift.status, fallback.status),
    openedAt: toStringValue(shift.opened_at, fallback.opened_at),
    closedAt: toNullableString(shift.closed_at) ?? fallback.closed_at,
    businessDate: toNullableString(shift.business_date) ?? fallback.business_date,
    shiftCount: 1,
    submittedQty: toNumber(totals.submitted_qty),
    readyQty: toNumber(totals.ready_qty),
    deliveredQty: toNumber(totals.delivered_qty),
    replacementDeliveredQty: toNumber(totals.replacement_delivered_qty),
    paidQty: toNumber(totals.paid_qty),
    deferredQty: toNumber(totals.deferred_qty),
    remadeQty: toNumber(totals.remade_qty),
    cancelledQty: toNumber(totals.cancelled_qty),
    waivedQty: toNumber(totals.waived_qty),
    netSales: toNumber(totals.net_sales),
    cashSales: toNumber(totals.cash_total),
    deferredSales: toNumber(totals.deferred_total),
    repaymentTotal: toNumber(totals.repayment_total),
    complaintTotal: toNumber(totals.complaint_total),
    complaintOpen: toNumber(totals.complaint_open),
    complaintResolved: toNumber(totals.complaint_resolved),
    complaintDismissed: toNumber(totals.complaint_dismissed),
    complaintRemake: toNumber(totals.complaint_remake),
    complaintCancel: toNumber(totals.complaint_cancel),
    complaintWaive: toNumber(totals.complaint_waive),
    itemIssueTotal: toNumber(totals.item_issue_total),
    itemIssueNote: toNumber(totals.item_issue_note),
    itemIssueRemake: toNumber(totals.item_issue_remake),
    itemIssueCancel: toNumber(totals.item_issue_cancel),
    itemIssueWaive: toNumber(totals.item_issue_waive),
    openSessions: toNumber(sessions.open_sessions),
    closedSessions: toNumber(sessions.closed_sessions),
    totalSessions: toNumber(sessions.total_sessions),
  };
}

function parseSnapshotProducts(snapshot: any): Map<string, ProductReportRow> {
  const byId = new Map<string, ProductReportRow>();
  const products = Array.isArray(snapshot?.products) ? snapshot.products : [];
  for (const raw of products) {
    const productId = toStringValue(raw?.product_id);
    if (!productId) continue;
    byId.set(productId, {
      productId,
      productName: toStringValue(raw?.product_name),
      stationCode: (toStringValue(raw?.station_code, 'barista') as StationCode),
      qtySubmitted: toNumber(raw?.qty_submitted),
      qtyReady: toNumber(raw?.qty_ready),
      qtyDelivered: toNumber(raw?.qty_delivered),
      qtyReplacementDelivered: toNumber(raw?.qty_replacement_delivered),
      qtyPaid: toNumber(raw?.qty_paid),
      qtyDeferred: toNumber(raw?.qty_deferred),
      qtyRemade: toNumber(raw?.qty_remade),
      qtyCancelled: toNumber(raw?.qty_cancelled),
      qtyWaived: toNumber(raw?.qty_waived),
      grossSales: toNumber(raw?.gross_sales),
      netSales: toNumber(raw?.net_sales),
    });
  }
  return byId;
}

function parseSnapshotStaff(snapshot: any): Map<string, StaffPerformanceRow> {
  const byLabel = new Map<string, StaffPerformanceRow>();
  const staffRows = Array.isArray(snapshot?.staff) ? snapshot.staff : [];
  for (const raw of staffRows) {
    const actorLabel = toStringValue(raw?.actor_label);
    if (!actorLabel) continue;
    byLabel.set(actorLabel, {
      actorLabel,
      submittedQty: toNumber(raw?.submitted_qty),
      readyQty: toNumber(raw?.ready_qty),
      deliveredQty: toNumber(raw?.delivered_qty),
      replacementDeliveredQty: toNumber(raw?.replacement_delivered_qty),
      remadeQty: toNumber(raw?.remade_qty),
      cancelledQty: toNumber(raw?.cancelled_qty),
      waivedQty: toNumber(raw?.waived_qty),
      paymentTotal: toNumber(raw?.payment_total),
      cashSales: toNumber(raw?.cash_sales),
      deferredSales: toNumber(raw?.deferred_sales),
      repaymentTotal: toNumber(raw?.repayment_total),
      complaintCount: toNumber(raw?.complaint_count),
      itemIssueCount: toNumber(raw?.item_issue_count),
    });
  }
  return byLabel;
}

function parseSnapshotComplaintEntries(snapshot: any, fallback: ShiftRow): ReportComplaintEntry[] {
  const rows = Array.isArray(snapshot?.complaints) ? snapshot.complaints : [];
  return sortComplaintEntries(
    rows.map((raw: any) => ({
      shiftId: fallback.id,
      shiftKind: fallback.shift_kind,
      businessDate: fallback.business_date,
      id: toStringValue(raw?.id),
      orderItemId: null,
      serviceSessionId: toStringValue(raw?.service_session_id),
      sessionLabel: toStringValue(raw?.session_label),
      productName: null,
      stationCode: null,
      complaintKind: toStringValue(raw?.complaint_kind, 'other') as ComplaintRecord['complaintKind'],
      status: toStringValue(raw?.status, 'open') as ComplaintRecord['status'],
      resolutionKind: toNullableString(raw?.resolution_kind) === 'dismissed' ? 'dismissed' : toStringValue(raw?.status) === 'resolved' ? 'resolved' : null,
      requestedQuantity: raw?.requested_quantity == null ? null : toNumber(raw?.requested_quantity),
      resolvedQuantity: raw?.resolved_quantity == null ? null : toNumber(raw?.resolved_quantity),
      notes: toNullableString(raw?.notes),
      createdAt: toStringValue(raw?.created_at),
      resolvedAt: toNullableString(raw?.resolved_at),
      createdByLabel: toNullableString(raw?.created_by_label),
      resolvedByLabel: toNullableString(raw?.resolved_by_label),
    }) satisfies ReportComplaintEntry),
  );
}

function parseSnapshotItemIssueEntries(snapshot: any, fallback: ShiftRow): ReportItemIssueEntry[] {
  const rows = Array.isArray(snapshot?.item_issues) ? snapshot.item_issues : [];
  return sortComplaintEntries(
    rows.map((raw: any) => ({
      shiftId: fallback.id,
      shiftKind: fallback.shift_kind,
      businessDate: fallback.business_date,
      id: toStringValue(raw?.id),
      orderItemId: toStringValue(raw?.order_item_id),
      serviceSessionId: toStringValue(raw?.service_session_id),
      sessionLabel: toStringValue(raw?.session_label),
      productName: toStringValue(raw?.product_name),
      stationCode: toNullableString(raw?.station_code) as StationCode | null,
      issueKind: toStringValue(raw?.issue_kind, 'other') as ItemIssueRecord['issueKind'],
      actionKind: toStringValue(raw?.action_kind, 'note') as ItemIssueRecord['actionKind'],
      status: toStringValue(raw?.status, 'logged') as ItemIssueRecord['status'],
      requestedQuantity: raw?.requested_quantity == null ? null : toNumber(raw?.requested_quantity),
      resolvedQuantity: raw?.resolved_quantity == null ? null : toNumber(raw?.resolved_quantity),
      notes: toNullableString(raw?.notes),
      createdAt: toStringValue(raw?.created_at),
      resolvedAt: toNullableString(raw?.resolved_at),
      createdByLabel: toNullableString(raw?.created_by_label),
      resolvedByLabel: toNullableString(raw?.resolved_by_label),
    }) satisfies ReportItemIssueEntry),
  );
}

function parseLiveComplaintEntry(row: ComplaintDetailRow, shift: ShiftRow, actorMaps: ActorMaps): ReportComplaintEntry {
  const sessionRef = firstRelation(row.service_sessions);
  return {
    shiftId: shift.id,
    shiftKind: shift.shift_kind,
    businessDate: shift.business_date,
    id: String(row.id),
    orderItemId: row.order_item_id ? String(row.order_item_id) : null,
    serviceSessionId: String(row.service_session_id),
    sessionLabel: toStringValue(sessionRef?.session_label),
    productName: null,
    stationCode: row.station_code ? (String(row.station_code) as StationCode) : null,
    complaintKind: toStringValue(row.complaint_kind, 'other') as ComplaintRecord['complaintKind'],
    status: toStringValue(row.status, 'open') as ComplaintRecord['status'],
    resolutionKind: toNullableString(row.resolution_kind) === 'dismissed' ? 'dismissed' : toStringValue(row.status) === 'resolved' ? 'resolved' : null,
    requestedQuantity: row.requested_quantity == null ? null : toNumber(row.requested_quantity),
    resolvedQuantity: row.resolved_quantity == null ? null : toNumber(row.resolved_quantity),
    notes: toNullableString(row.notes),
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdByLabel: actorLabelFromIds({ by_staff_id: row.created_by_staff_id, by_owner_id: row.created_by_owner_id }, actorMaps),
    resolvedByLabel: actorLabelFromIds({ by_staff_id: row.resolved_by_staff_id, by_owner_id: row.resolved_by_owner_id }, actorMaps),
  };
}

function parseLiveItemIssueEntry(row: ItemIssueDetailRow, shift: ShiftRow, actorMaps: ActorMaps): ReportItemIssueEntry {
  const sessionRef = firstRelation(row.service_sessions);
  const orderItemRef = firstRelation(row.order_items);
  const productRef = firstRelation(orderItemRef?.menu_products as { product_name: string | null } | { product_name: string | null }[] | null | undefined);
  return {
    shiftId: shift.id,
    shiftKind: shift.shift_kind,
    businessDate: shift.business_date,
    id: String(row.id),
    orderItemId: String(row.order_item_id),
    serviceSessionId: String(row.service_session_id),
    sessionLabel: toStringValue(sessionRef?.session_label),
    productName: toStringValue(productRef?.product_name),
    stationCode: row.station_code ? (String(row.station_code) as StationCode) : null,
    issueKind: toStringValue(row.issue_kind, 'other') as ItemIssueRecord['issueKind'],
    actionKind: toStringValue(row.action_kind, 'note') as ItemIssueRecord['actionKind'],
    status: toStringValue(row.status, 'logged') as ItemIssueRecord['status'],
    requestedQuantity: row.requested_quantity == null ? null : toNumber(row.requested_quantity),
    resolvedQuantity: row.resolved_quantity == null ? null : toNumber(row.resolved_quantity),
    notes: toNullableString(row.notes),
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdByLabel: actorLabelFromIds({ by_staff_id: row.created_by_staff_id, by_owner_id: row.created_by_owner_id }, actorMaps),
    resolvedByLabel: actorLabelFromIds({ by_staff_id: row.resolved_by_staff_id, by_owner_id: row.resolved_by_owner_id }, actorMaps),
  };
}

async function loadSnapshotAggregates(cafeId: string, shiftRows: ShiftRow[]): Promise<AggregateMaps> {
  const shiftRowsById = new Map<string, ReportShiftRow>();
  const productsByShift = new Map<string, Map<string, ProductReportRow>>();
  const staffByShift = new Map<string, Map<string, StaffPerformanceRow>>();
  const complaintsByShift = new Map<string, ReportComplaintEntry[]>();
  const itemIssuesByShift = new Map<string, ReportItemIssueEntry[]>();

  const closedShiftIds = shiftRows.filter((row) => row.status === 'closed').map((row) => row.id);
  if (!closedShiftIds.length) {
    return { shiftRowsById, productsByShift, staffByShift, complaintsByShift, itemIssuesByShift };
  }

  const { data, error } = await adminOps()
    .from('shift_snapshots')
    .select('shift_id, snapshot_json')
    .eq('cafe_id', cafeId)
    .in('shift_id', closedShiftIds);

  if (error) throw error;

  for (const row of (data ?? []) as SnapshotRow[]) {
    const meta = shiftRows.find((item) => item.id === String(row.shift_id));
    if (!meta) continue;
    const snapshot = row.snapshot_json;
    const shiftId = String(row.shift_id);
    shiftRowsById.set(shiftId, parseSnapshotShiftRow(snapshot, meta));
    productsByShift.set(shiftId, parseSnapshotProducts(snapshot));
    staffByShift.set(shiftId, parseSnapshotStaff(snapshot));
    complaintsByShift.set(shiftId, parseSnapshotComplaintEntries(snapshot, meta));
    itemIssuesByShift.set(shiftId, parseSnapshotItemIssueEntries(snapshot, meta));
  }

  return { shiftRowsById, productsByShift, staffByShift, complaintsByShift, itemIssuesByShift };
}

async function loadLiveAggregates(cafeId: string, shifts: ShiftRow[], actorMaps: ActorMaps): Promise<AggregateMaps> {
  const shiftRowsById = new Map<string, ReportShiftRow>();
  const productsByShift = new Map<string, Map<string, ProductReportRow>>();
  const staffByShift = new Map<string, Map<string, StaffPerformanceRow>>();
  const complaintsByShift = new Map<string, ReportComplaintEntry[]>();
  const itemIssuesByShift = new Map<string, ReportItemIssueEntry[]>();
  if (!shifts.length) return { shiftRowsById, productsByShift, staffByShift, complaintsByShift, itemIssuesByShift };

  const shiftIds = shifts.map((row) => row.id);
  const shiftMap = new Map<string, ReportShiftRow>();
  const shiftMetaById = new Map<string, ShiftRow>();
  for (const shift of shifts) {
    const row = createShiftRow(shift);
    shiftMap.set(shift.id, row);
    shiftMetaById.set(shift.id, shift);
    shiftRowsById.set(shift.id, row);
  }

  const [
    { data: itemRows, error: itemError },
    { data: paymentRows, error: paymentError },
    { data: sessionRows, error: sessionError },
    { data: complaintRows, error: complaintError },
    { data: itemIssueRows, error: itemIssueError },
    { data: fulfillmentRows, error: fulfillmentError },
  ] = await Promise.all([
    adminOps()
      .from('order_items')
      .select('shift_id, station_code, unit_price, qty_submitted, qty_ready, qty_delivered, qty_replacement_delivered, qty_paid, qty_deferred, qty_remade, qty_cancelled, qty_waived, menu_products!inner(id, product_name)')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps()
      .from('payments')
      .select('shift_id, payment_kind, total_amount, by_staff_id, by_owner_id')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps()
      .from('service_sessions')
      .select('shift_id, status')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps()
      .from('complaints')
      .select('shift_id, id, order_item_id, service_session_id, station_code, complaint_kind, complaint_scope, status, resolution_kind, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label)')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds)
      .eq('complaint_scope', 'general'),
    adminOps()
      .from('order_item_issues')
      .select('shift_id, id, order_item_id, service_session_id, station_code, issue_kind, action_kind, status, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label), order_items!inner(menu_products(product_name))')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps()
      .from('fulfillment_events')
      .select('shift_id, event_code, quantity, by_staff_id, by_owner_id')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
  ]);

  if (itemError) throw itemError;
  if (paymentError) throw paymentError;
  if (sessionError) throw sessionError;
  if (complaintError) throw complaintError;
  if (itemIssueError) throw itemIssueError;
  if (fulfillmentError) throw fulfillmentError;

  for (const row of (itemRows ?? []) as ItemRow[]) {
    const shiftId = String(row.shift_id ?? '');
    const shift = shiftMap.get(shiftId);
    if (!shift) continue;
    const qtySubmitted = toNumber(row.qty_submitted);
    const qtyReady = toNumber(row.qty_ready);
    const qtyDelivered = toNumber(row.qty_delivered);
    const qtyReplacementDelivered = toNumber(row.qty_replacement_delivered);
    const qtyPaid = toNumber(row.qty_paid);
    const qtyDeferred = toNumber(row.qty_deferred);
    const qtyRemade = toNumber(row.qty_remade);
    const qtyCancelled = toNumber(row.qty_cancelled);
    const qtyWaived = toNumber(row.qty_waived);
    const unitPrice = toNumber(row.unit_price);
    const grossSales = qtyDelivered * unitPrice;
    const netSales = Math.max(qtyDelivered - qtyWaived, 0) * unitPrice;
    shift.submittedQty += qtySubmitted;
    shift.readyQty += qtyReady;
    shift.deliveredQty += qtyDelivered;
    shift.replacementDeliveredQty += qtyReplacementDelivered;
    shift.paidQty += qtyPaid;
    shift.deferredQty += qtyDeferred;
    shift.remadeQty += qtyRemade;
    shift.cancelledQty += qtyCancelled;
    shift.waivedQty += qtyWaived;
    shift.netSales += netSales;

    const productRef = Array.isArray(row.menu_products) ? row.menu_products[0] : row.menu_products;
    const productId = String(productRef?.id ?? '');
    if (!productId) continue;
    const stationCode = String(row.station_code ?? 'barista') as StationCode;
    const shiftProducts = productsByShift.get(shiftId) ?? new Map<string, ProductReportRow>();
    const product = shiftProducts.get(productId) ?? createProductRow(productId, String(productRef?.product_name ?? ''), stationCode);
    product.qtySubmitted += qtySubmitted;
    product.qtyReady += qtyReady;
    product.qtyDelivered += qtyDelivered;
    product.qtyReplacementDelivered += qtyReplacementDelivered;
    product.qtyPaid += qtyPaid;
    product.qtyDeferred += qtyDeferred;
    product.qtyRemade += qtyRemade;
    product.qtyCancelled += qtyCancelled;
    product.qtyWaived += qtyWaived;
    product.grossSales += grossSales;
    product.netSales += netSales;
    shiftProducts.set(productId, product);
    productsByShift.set(shiftId, shiftProducts);
  }

  for (const row of (paymentRows ?? []) as PaymentRow[]) {
    const shiftId = String(row.shift_id ?? '');
    const shift = shiftMap.get(shiftId);
    if (!shift) continue;
    const amount = toNumber(row.total_amount);
    const paymentKind = String(row.payment_kind ?? '');
    if (paymentKind === 'cash' || paymentKind === 'mixed') shift.cashSales += amount;
    if (paymentKind === 'deferred') shift.deferredSales += amount;
    if (paymentKind === 'repayment') shift.repaymentTotal += amount;

    const actorLabel = actorLabelFromIds({ by_staff_id: row.by_staff_id, by_owner_id: row.by_owner_id }, actorMaps);
    if (!actorLabel) continue;
    const shiftStaff = staffByShift.get(shiftId) ?? new Map<string, StaffPerformanceRow>();
    const staff = shiftStaff.get(actorLabel) ?? createStaffRow(actorLabel);
    staff.paymentTotal += amount;
    if (paymentKind === 'cash' || paymentKind === 'mixed') staff.cashSales += amount;
    if (paymentKind === 'deferred') staff.deferredSales += amount;
    if (paymentKind === 'repayment') staff.repaymentTotal += amount;
    shiftStaff.set(actorLabel, staff);
    staffByShift.set(shiftId, shiftStaff);
  }

  for (const row of (sessionRows ?? []) as SessionRow[]) {
    const shiftId = String(row.shift_id ?? '');
    const shift = shiftMap.get(shiftId);
    if (!shift) continue;
    const status = String(row.status ?? '');
    if (status === 'open') shift.openSessions += 1;
    else if (status === 'closed') shift.closedSessions += 1;
    shift.totalSessions += 1;
  }

  for (const row of (complaintRows ?? []) as ComplaintDetailRow[]) {
    const shiftId = String(row.shift_id ?? '');
    const shift = shiftMap.get(shiftId);
    const shiftMeta = shiftMetaById.get(shiftId);
    if (!shift || !shiftMeta) continue;
    shift.complaintTotal += 1;
    const status = String(row.status ?? '');
    if (status === 'open') shift.complaintOpen += 1;
    if (status === 'resolved') shift.complaintResolved += 1;
    if (status === 'dismissed') shift.complaintDismissed += 1;
    const resolutionKind = String(row.resolution_kind ?? '');
    if (resolutionKind === 'remake') shift.complaintRemake += 1;
    if (resolutionKind === 'cancel_undelivered') shift.complaintCancel += 1;
    if (resolutionKind === 'waive_delivered') shift.complaintWaive += 1;
    const actorLabel = actorLabelFromIds({ by_staff_id: row.created_by_staff_id, by_owner_id: row.created_by_owner_id }, actorMaps);
    if (actorLabel) {
      const shiftStaff = staffByShift.get(shiftId) ?? new Map<string, StaffPerformanceRow>();
      const staff = shiftStaff.get(actorLabel) ?? createStaffRow(actorLabel);
      staff.complaintCount += 1;
      shiftStaff.set(actorLabel, staff);
      staffByShift.set(shiftId, shiftStaff);
    }
    const details = complaintsByShift.get(shiftId) ?? [];
    details.push(parseLiveComplaintEntry(row, shiftMeta, actorMaps));
    complaintsByShift.set(shiftId, details);
  }

  for (const row of (itemIssueRows ?? []) as ItemIssueDetailRow[]) {
    const shiftId = String(row.shift_id ?? '');
    const shift = shiftMap.get(shiftId);
    const shiftMeta = shiftMetaById.get(shiftId);
    if (!shift || !shiftMeta) continue;
    shift.itemIssueTotal += 1;
    const actionKind = String(row.action_kind ?? 'note');
    if (actionKind === 'note') shift.itemIssueNote += 1;
    if (actionKind === 'remake') shift.itemIssueRemake += 1;
    if (actionKind === 'cancel_undelivered') shift.itemIssueCancel += 1;
    if (actionKind === 'waive_delivered') shift.itemIssueWaive += 1;
    const actorLabel = actorLabelFromIds({ by_staff_id: row.created_by_staff_id, by_owner_id: row.created_by_owner_id }, actorMaps);
    if (actorLabel) {
      const shiftStaff = staffByShift.get(shiftId) ?? new Map<string, StaffPerformanceRow>();
      const staff = shiftStaff.get(actorLabel) ?? createStaffRow(actorLabel);
      staff.itemIssueCount += 1;
      shiftStaff.set(actorLabel, staff);
      staffByShift.set(shiftId, shiftStaff);
    }
    const details = itemIssuesByShift.get(shiftId) ?? [];
    details.push(parseLiveItemIssueEntry(row, shiftMeta, actorMaps));
    itemIssuesByShift.set(shiftId, details);
  }

  for (const row of (fulfillmentRows ?? []) as FulfillmentAggRow[]) {
    const shiftId = String(row.shift_id ?? '');
    if (!shiftMap.has(shiftId)) continue;
    const actorLabel = actorLabelFromIds({ by_staff_id: row.by_staff_id, by_owner_id: row.by_owner_id }, actorMaps);
    if (!actorLabel) continue;
    const quantity = toNumber(row.quantity);
    const eventCode = String(row.event_code ?? '');
    const shiftStaff = staffByShift.get(shiftId) ?? new Map<string, StaffPerformanceRow>();
    const staff = shiftStaff.get(actorLabel) ?? createStaffRow(actorLabel);
    if (eventCode === 'submitted') staff.submittedQty += quantity;
    if (eventCode === 'remake_submitted') staff.remadeQty += quantity;
    if (eventCode === 'partial_ready' || eventCode === 'ready') staff.readyQty += quantity;
    if (eventCode === 'delivered') staff.deliveredQty += quantity;
    if (eventCode === 'remake_delivered') staff.replacementDeliveredQty += quantity;
    if (eventCode === 'cancelled') staff.cancelledQty += quantity;
    if (eventCode === 'waived') staff.waivedQty += quantity;
    shiftStaff.set(actorLabel, staff);
    staffByShift.set(shiftId, shiftStaff);
  }

  for (const [shiftId, rows] of complaintsByShift.entries()) {
    complaintsByShift.set(shiftId, sortComplaintEntries(rows));
  }
  for (const [shiftId, rows] of itemIssuesByShift.entries()) {
    itemIssuesByShift.set(shiftId, sortComplaintEntries(rows));
  }

  return { shiftRowsById, productsByShift, staffByShift, complaintsByShift, itemIssuesByShift };
}

export async function buildReportsWorkspace(cafeId: string): Promise<ReportsWorkspace> {
  const referenceDate = cairoToday();
  const ranges = {
    day: { key: 'day' as const, label: 'اليوم', startDate: referenceDate, endDate: referenceDate },
    week: { key: 'week' as const, label: 'الأسبوع', startDate: startOfWeek(referenceDate), endDate: referenceDate },
    month: { key: 'month' as const, label: 'الشهر', startDate: startOfMonth(referenceDate), endDate: referenceDate },
    year: { key: 'year' as const, label: 'السنة', startDate: startOfYear(referenceDate), endDate: referenceDate },
  };

  const [actorMaps, deferredCustomers, shiftsResponse] = await Promise.all([
    loadActorMaps(cafeId),
    buildDeferredCustomersWorkspace(cafeId),
    adminOps()
      .from('shifts')
      .select('id, shift_kind, status, opened_at, closed_at, business_date')
      .eq('cafe_id', cafeId)
      .gte('business_date', ranges.year.startDate)
      .lte('business_date', ranges.year.endDate)
      .order('business_date', { ascending: false })
      .order('opened_at', { ascending: false }),
  ]);

  if (shiftsResponse.error) throw shiftsResponse.error;

  const shifts = ((shiftsResponse.data ?? []) as Record<string, unknown>[]).map(
    (row) =>
      ({
        id: String(row.id),
        shift_kind: String(row.shift_kind ?? ''),
        status: String(row.status ?? ''),
        opened_at: String(row.opened_at ?? ''),
        closed_at: row.closed_at ? String(row.closed_at) : null,
        business_date: row.business_date ? String(row.business_date) : null,
      }) satisfies ShiftRow,
  );

  if (!shifts.length) {
    const emptyMaps: AggregateMaps = {
      shiftRowsById: new Map(),
      productsByShift: new Map(),
      staffByShift: new Map(),
      complaintsByShift: new Map(),
      itemIssuesByShift: new Map(),
    };
    return {
      referenceDate,
      currentShift: null,
      currentProducts: [],
      currentStaff: [],
      currentComplaints: [],
      currentItemIssues: [],
      periods: {
        day: buildPeriodReport({ ...ranges.day, shiftRows: [], productsByShift: emptyMaps.productsByShift, staffByShift: emptyMaps.staffByShift, complaintsByShift: emptyMaps.complaintsByShift, itemIssuesByShift: emptyMaps.itemIssuesByShift }),
        week: buildPeriodReport({ ...ranges.week, shiftRows: [], productsByShift: emptyMaps.productsByShift, staffByShift: emptyMaps.staffByShift, complaintsByShift: emptyMaps.complaintsByShift, itemIssuesByShift: emptyMaps.itemIssuesByShift }),
        month: buildPeriodReport({ ...ranges.month, shiftRows: [], productsByShift: emptyMaps.productsByShift, staffByShift: emptyMaps.staffByShift, complaintsByShift: emptyMaps.complaintsByShift, itemIssuesByShift: emptyMaps.itemIssuesByShift }),
        year: buildPeriodReport({ ...ranges.year, shiftRows: [], productsByShift: emptyMaps.productsByShift, staffByShift: emptyMaps.staffByShift, complaintsByShift: emptyMaps.complaintsByShift, itemIssuesByShift: emptyMaps.itemIssuesByShift }),
      },
      deferredCustomers: deferredCustomers as DeferredCustomerSummary[],
    };
  }

  const snapshotAggregates = await loadSnapshotAggregates(cafeId, shifts);
  const missingClosedIds = shifts
    .filter((row) => row.status === 'closed' && !snapshotAggregates.shiftRowsById.has(row.id))
    .map((row) => row.id);
  const liveShiftRows = shifts.filter((row) => row.status === 'open' || missingClosedIds.includes(row.id));
  const liveAggregates = await loadLiveAggregates(cafeId, liveShiftRows, actorMaps);

  const combinedShiftRowsById = new Map<string, ReportShiftRow>(snapshotAggregates.shiftRowsById);
  const combinedProductsByShift = new Map<string, Map<string, ProductReportRow>>(snapshotAggregates.productsByShift);
  const combinedStaffByShift = new Map<string, Map<string, StaffPerformanceRow>>(snapshotAggregates.staffByShift);
  const combinedComplaintsByShift = new Map<string, ReportComplaintEntry[]>(snapshotAggregates.complaintsByShift);
  const combinedItemIssuesByShift = new Map<string, ReportItemIssueEntry[]>(snapshotAggregates.itemIssuesByShift);

  for (const [key, value] of liveAggregates.shiftRowsById.entries()) combinedShiftRowsById.set(key, value);
  for (const [key, value] of liveAggregates.productsByShift.entries()) combinedProductsByShift.set(key, value);
  for (const [key, value] of liveAggregates.staffByShift.entries()) combinedStaffByShift.set(key, value);
  for (const [key, value] of liveAggregates.complaintsByShift.entries()) combinedComplaintsByShift.set(key, value);
  for (const [key, value] of liveAggregates.itemIssuesByShift.entries()) combinedItemIssuesByShift.set(key, value);

  const shiftRows = shifts
    .map((row) => combinedShiftRowsById.get(row.id))
    .filter(Boolean) as ReportShiftRow[];

  const currentShift = sortShifts(shiftRows.filter((row) => row.status === 'open'))[0] ?? null;
  const currentProducts = currentShift
    ? sortProducts(Array.from(combinedProductsByShift.get(currentShift.shiftId)?.values() ?? []))
    : [];
  const currentStaff = currentShift
    ? sortStaff(Array.from(combinedStaffByShift.get(currentShift.shiftId)?.values() ?? []))
    : [];
  const currentComplaints = currentShift
    ? sortComplaintEntries(combinedComplaintsByShift.get(currentShift.shiftId) ?? []).slice(0, 50)
    : [];
  const currentItemIssues = currentShift
    ? sortComplaintEntries(combinedItemIssuesByShift.get(currentShift.shiftId) ?? []).slice(0, 50)
    : [];

  return {
    referenceDate,
    currentShift,
    currentProducts,
    currentStaff,
    currentComplaints,
    currentItemIssues,
    periods: {
      day: buildPeriodReport({ ...ranges.day, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
      week: buildPeriodReport({ ...ranges.week, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
      month: buildPeriodReport({ ...ranges.month, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
      year: buildPeriodReport({ ...ranges.year, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
    },
    deferredCustomers: deferredCustomers as DeferredCustomerSummary[],
  };
}
