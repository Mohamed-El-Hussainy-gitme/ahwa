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
import { adminOps, buildDeferredCustomersWorkspace, ensureRuntimeContract } from '@/app/api/ops/_server';

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
type DailySnapshotRow = { business_date: string; snapshot_json: unknown };
type WeeklySummaryRow = { week_start_date: string; summary_json: unknown };
type MonthlySummaryRow = { month_start_date: string; summary_json: unknown };
type YearlySummaryRow = { year_start_date: string; summary_json: unknown };
type ActorMaps = { staffNames: Map<string, string>; ownerNames: Map<string, string> };

type AggregateMaps = {
  shiftRowsById: Map<string, ReportShiftRow>;
  productsByShift: Map<string, Map<string, ProductReportRow>>;
  staffByShift: Map<string, Map<string, StaffPerformanceRow>>;
  complaintsByShift: Map<string, ReportComplaintEntry[]>;
  itemIssuesByShift: Map<string, ReportItemIssueEntry[]>;
};

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
    itemNetSales: 0,
    recognizedSales: 0,
    salesReconciliationGap: 0,
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
  target.itemNetSales += source.itemNetSales;
  target.recognizedSales += source.recognizedSales;
  target.salesReconciliationGap += source.salesReconciliationGap;
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


function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function applySalesReconciliation<T extends ReportTotals>(totals: T): T {
  const itemNetSales = roundMoney(totals.itemNetSales || totals.netSales || 0);
  const recognizedSales = roundMoney(totals.recognizedSales || totals.cashSales + totals.deferredSales);
  const positiveGap = roundMoney(Math.max(recognizedSales - itemNetSales, 0));
  totals.itemNetSales = itemNetSales;
  totals.recognizedSales = recognizedSales;
  totals.salesReconciliationGap = positiveGap;
  totals.netSales = roundMoney(positiveGap > 0 ? recognizedSales : itemNetSales);
  return totals;
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

async function loadActorMaps(cafeId: string, databaseKey: string): Promise<ActorMaps> {
  const admin = adminOps(databaseKey);
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
  return applySalesReconciliation({
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
    itemNetSales: toNumber(totals.item_net_sales ?? totals.net_sales),
    recognizedSales: toNumber(totals.recognized_sales ?? (toNumber(totals.cash_total) + toNumber(totals.deferred_total))),
    salesReconciliationGap: toNumber(totals.sales_gap),
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
  });
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

async function loadSnapshotAggregates(cafeId: string, shiftRows: ShiftRow[], databaseKey: string): Promise<AggregateMaps> {
  const shiftRowsById = new Map<string, ReportShiftRow>();
  const productsByShift = new Map<string, Map<string, ProductReportRow>>();
  const staffByShift = new Map<string, Map<string, StaffPerformanceRow>>();
  const complaintsByShift = new Map<string, ReportComplaintEntry[]>();
  const itemIssuesByShift = new Map<string, ReportItemIssueEntry[]>();

  const closedShiftIds = shiftRows.filter((row) => row.status === 'closed').map((row) => row.id);
  if (!closedShiftIds.length) {
    return { shiftRowsById, productsByShift, staffByShift, complaintsByShift, itemIssuesByShift };
  }

  const { data, error } = await adminOps(databaseKey)
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

async function loadLiveAggregates(cafeId: string, shifts: ShiftRow[], actorMaps: ActorMaps, databaseKey: string): Promise<AggregateMaps> {
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
    adminOps(databaseKey)
      .from('order_items')
      .select('shift_id, station_code, unit_price, qty_submitted, qty_ready, qty_delivered, qty_replacement_delivered, qty_paid, qty_deferred, qty_remade, qty_cancelled, qty_waived, menu_products!inner(id, product_name)')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps(databaseKey)
      .from('payments')
      .select('shift_id, payment_kind, total_amount, by_staff_id, by_owner_id')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps(databaseKey)
      .from('service_sessions')
      .select('shift_id, status')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps(databaseKey)
      .from('complaints')
      .select('shift_id, id, order_item_id, service_session_id, station_code, complaint_kind, complaint_scope, status, resolution_kind, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label)')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds)
      .eq('complaint_scope', 'general'),
    adminOps(databaseKey)
      .from('order_item_issues')
      .select('shift_id, id, order_item_id, service_session_id, station_code, issue_kind, action_kind, status, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label), order_items!inner(menu_products(product_name))')
      .eq('cafe_id', cafeId)
      .in('shift_id', shiftIds),
    adminOps(databaseKey)
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
    shift.itemNetSales += netSales;
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

  for (const shift of shiftMap.values()) {
    shift.recognizedSales = roundMoney(shift.cashSales + shift.deferredSales);
    applySalesReconciliation(shift);
  }

  for (const [shiftId, rows] of complaintsByShift.entries()) {
    complaintsByShift.set(shiftId, sortComplaintEntries(rows));
  }
  for (const [shiftId, rows] of itemIssuesByShift.entries()) {
    itemIssuesByShift.set(shiftId, sortComplaintEntries(rows));
  }

  return { shiftRowsById, productsByShift, staffByShift, complaintsByShift, itemIssuesByShift };
}


type SummarySnapshotBundle = {
  dailyByDate: Map<string, unknown>;
  weeklyByStart: Map<string, unknown>;
  monthlyByStart: Map<string, unknown>;
  yearlyByStart: Map<string, unknown>;
};

function parseSummaryTotals(summaryLike: any): ReportTotals {
  const summary = summaryLike?.summary ?? summaryLike ?? {};
  return applySalesReconciliation({
    ...emptyTotals(),
    shiftCount: toNumber(summary?.shift_count),
    submittedQty: toNumber(summary?.submitted_qty),
    readyQty: toNumber(summary?.ready_qty),
    deliveredQty: toNumber(summary?.delivered_qty),
    replacementDeliveredQty: toNumber(summary?.replacement_delivered_qty),
    paidQty: toNumber(summary?.paid_qty),
    deferredQty: toNumber(summary?.deferred_qty),
    remadeQty: toNumber(summary?.remade_qty),
    cancelledQty: toNumber(summary?.cancelled_qty),
    waivedQty: toNumber(summary?.waived_qty),
    netSales: toNumber(summary?.net_sales),
    itemNetSales: toNumber(summary?.item_net_sales ?? summary?.net_sales),
    recognizedSales: toNumber(summary?.recognized_sales ?? (toNumber(summary?.cash_total) + toNumber(summary?.deferred_total))),
    salesReconciliationGap: toNumber(summary?.sales_gap),
    cashSales: toNumber(summary?.cash_total),
    deferredSales: toNumber(summary?.deferred_total),
    repaymentTotal: toNumber(summary?.repayment_total),
    complaintTotal: toNumber(summary?.complaint_total),
    complaintOpen: toNumber(summary?.complaint_open),
    complaintResolved: toNumber(summary?.complaint_resolved),
    complaintDismissed: toNumber(summary?.complaint_dismissed),
    complaintRemake: toNumber(summary?.complaint_remake),
    complaintCancel: toNumber(summary?.complaint_cancel),
    complaintWaive: toNumber(summary?.complaint_waive),
    itemIssueTotal: toNumber(summary?.item_issue_total),
    itemIssueNote: toNumber(summary?.item_issue_note),
    itemIssueRemake: toNumber(summary?.item_issue_remake),
    itemIssueCancel: toNumber(summary?.item_issue_cancel),
    itemIssueWaive: toNumber(summary?.item_issue_waive),
    openSessions: toNumber(summary?.open_sessions),
    closedSessions: toNumber(summary?.closed_sessions),
    totalSessions: toNumber(summary?.total_sessions),
  });
}

function parseSummaryProducts(summaryLike: any): ProductReportRow[] {
  const rows = Array.isArray(summaryLike?.products) ? summaryLike.products : [];
  return sortProducts(
    rows
      .map((raw: any) => {
        const productId = toStringValue(raw?.product_id);
        if (!productId) return null;
        return {
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
        } satisfies ProductReportRow;
      })
      .filter(Boolean) as ProductReportRow[],
  );
}

function parseSummaryStaff(summaryLike: any): StaffPerformanceRow[] {
  const rows = Array.isArray(summaryLike?.staff) ? summaryLike.staff : [];
  return sortStaff(
    rows
      .map((raw: any) => {
        const actorLabel = toStringValue(raw?.actor_label);
        if (!actorLabel) return null;
        return {
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
        } satisfies StaffPerformanceRow;
      })
      .filter(Boolean) as StaffPerformanceRow[],
  );
}

function parseDailySnapshotDayRow(businessDate: string, snapshotLike: any): ReportBusinessDayRow {
  const totals = parseSummaryTotals(snapshotLike);
  return {
    businessDate,
    ...totals,
  };
}

function mergeProductCollections(base: ProductReportRow[], supplement: ProductReportRow[]): ProductReportRow[] {
  const byId = new Map<string, ProductReportRow>();
  for (const row of base) {
    byId.set(row.productId, { ...row });
  }
  for (const row of supplement) {
    const current = byId.get(row.productId) ?? createProductRow(row.productId, row.productName, row.stationCode);
    mergeProductRows(current, row);
    byId.set(row.productId, current);
  }
  return sortProducts(Array.from(byId.values()));
}

function mergeStaffCollections(base: StaffPerformanceRow[], supplement: StaffPerformanceRow[]): StaffPerformanceRow[] {
  const byLabel = new Map<string, StaffPerformanceRow>();
  for (const row of base) {
    byLabel.set(row.actorLabel, { ...row });
  }
  for (const row of supplement) {
    const current = byLabel.get(row.actorLabel) ?? createStaffRow(row.actorLabel);
    mergeStaffRows(current, row);
    byLabel.set(row.actorLabel, current);
  }
  return sortStaff(Array.from(byLabel.values()));
}

function mergeDayCollections(base: ReportBusinessDayRow[], supplement: ReportBusinessDayRow[]): ReportBusinessDayRow[] {
  const byDate = new Map<string, ReportBusinessDayRow>();
  for (const row of base) {
    byDate.set(row.businessDate, { ...row });
  }
  for (const row of supplement) {
    const current = byDate.get(row.businessDate) ?? createEmptyDayRow(row.businessDate);
    addTotals(current, row);
    byDate.set(row.businessDate, current);
  }
  return Array.from(byDate.values()).sort((left, right) => right.businessDate.localeCompare(left.businessDate));
}

async function loadSummarySnapshots(cafeId: string, ranges: {
  day: { startDate: string; endDate: string };
  week: { startDate: string; endDate: string };
  month: { startDate: string; endDate: string };
  year: { startDate: string; endDate: string };
}, databaseKey: string): Promise<SummarySnapshotBundle> {
  const [{ data: dailyRows, error: dailyError }, { data: weeklyRows, error: weeklyError }, { data: monthlyRows, error: monthlyError }, { data: yearlyRows, error: yearlyError }] = await Promise.all([
    adminOps(databaseKey)
      .from('daily_snapshots')
      .select('business_date, snapshot_json')
      .eq('cafe_id', cafeId)
      .gte('business_date', ranges.year.startDate)
      .lte('business_date', ranges.year.endDate),
    adminOps(databaseKey)
      .from('weekly_summaries')
      .select('week_start_date, summary_json')
      .eq('cafe_id', cafeId)
      .eq('week_start_date', ranges.week.startDate)
      .limit(1),
    adminOps(databaseKey)
      .from('monthly_summaries')
      .select('month_start_date, summary_json')
      .eq('cafe_id', cafeId)
      .eq('month_start_date', ranges.month.startDate)
      .limit(1),
    adminOps(databaseKey)
      .from('yearly_summaries')
      .select('year_start_date, summary_json')
      .eq('cafe_id', cafeId)
      .eq('year_start_date', ranges.year.startDate)
      .limit(1),
  ]);

  if (dailyError) throw dailyError;
  if (weeklyError) throw weeklyError;
  if (monthlyError) throw monthlyError;
  if (yearlyError) throw yearlyError;

  return {
    dailyByDate: new Map(((dailyRows ?? []) as DailySnapshotRow[]).map((row) => [String(row.business_date), row.snapshot_json])),
    weeklyByStart: new Map(((weeklyRows ?? []) as WeeklySummaryRow[]).map((row) => [String(row.week_start_date), row.summary_json])),
    monthlyByStart: new Map(((monthlyRows ?? []) as MonthlySummaryRow[]).map((row) => [String(row.month_start_date), row.summary_json])),
    yearlyByStart: new Map(((yearlyRows ?? []) as YearlySummaryRow[]).map((row) => [String(row.year_start_date), row.summary_json])),
  };
}

function numbersRoughlyEqual(left: number, right: number, tolerance = 0.01): boolean {
  return Math.abs(left - right) <= tolerance;
}

function totalsCompatible(left: ReportTotals, right: ReportTotals): boolean {
  return (
    numbersRoughlyEqual(left.shiftCount, right.shiftCount, 0) &&
    numbersRoughlyEqual(left.submittedQty, right.submittedQty, 0) &&
    numbersRoughlyEqual(left.readyQty, right.readyQty, 0) &&
    numbersRoughlyEqual(left.deliveredQty, right.deliveredQty, 0) &&
    numbersRoughlyEqual(left.replacementDeliveredQty, right.replacementDeliveredQty, 0) &&
    numbersRoughlyEqual(left.paidQty, right.paidQty, 0) &&
    numbersRoughlyEqual(left.deferredQty, right.deferredQty, 0) &&
    numbersRoughlyEqual(left.remadeQty, right.remadeQty, 0) &&
    numbersRoughlyEqual(left.cancelledQty, right.cancelledQty, 0) &&
    numbersRoughlyEqual(left.waivedQty, right.waivedQty, 0) &&
    numbersRoughlyEqual(left.netSales, right.netSales) &&
    numbersRoughlyEqual(left.itemNetSales, right.itemNetSales) &&
    numbersRoughlyEqual(left.recognizedSales, right.recognizedSales) &&
    numbersRoughlyEqual(left.salesReconciliationGap, right.salesReconciliationGap) &&
    numbersRoughlyEqual(left.cashSales, right.cashSales) &&
    numbersRoughlyEqual(left.deferredSales, right.deferredSales) &&
    numbersRoughlyEqual(left.repaymentTotal, right.repaymentTotal) &&
    numbersRoughlyEqual(left.complaintTotal, right.complaintTotal, 0) &&
    numbersRoughlyEqual(left.complaintOpen, right.complaintOpen, 0) &&
    numbersRoughlyEqual(left.complaintResolved, right.complaintResolved, 0) &&
    numbersRoughlyEqual(left.complaintDismissed, right.complaintDismissed, 0) &&
    numbersRoughlyEqual(left.complaintRemake, right.complaintRemake, 0) &&
    numbersRoughlyEqual(left.complaintCancel, right.complaintCancel, 0) &&
    numbersRoughlyEqual(left.complaintWaive, right.complaintWaive, 0) &&
    numbersRoughlyEqual(left.itemIssueTotal, right.itemIssueTotal, 0) &&
    numbersRoughlyEqual(left.itemIssueNote, right.itemIssueNote, 0) &&
    numbersRoughlyEqual(left.itemIssueRemake, right.itemIssueRemake, 0) &&
    numbersRoughlyEqual(left.itemIssueCancel, right.itemIssueCancel, 0) &&
    numbersRoughlyEqual(left.itemIssueWaive, right.itemIssueWaive, 0) &&
    numbersRoughlyEqual(left.openSessions, right.openSessions, 0) &&
    numbersRoughlyEqual(left.closedSessions, right.closedSessions, 0) &&
    numbersRoughlyEqual(left.totalSessions, right.totalSessions, 0)
  );
}

function productCollectionsCompatible(left: ProductReportRow[], right: ProductReportRow[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((row) => [row.productId, row]));
  for (const row of left) {
    const candidate = rightById.get(row.productId);
    if (!candidate) return false;
    if (
      row.productName !== candidate.productName ||
      row.stationCode !== candidate.stationCode ||
      !numbersRoughlyEqual(row.qtySubmitted, candidate.qtySubmitted, 0) ||
      !numbersRoughlyEqual(row.qtyReady, candidate.qtyReady, 0) ||
      !numbersRoughlyEqual(row.qtyDelivered, candidate.qtyDelivered, 0) ||
      !numbersRoughlyEqual(row.qtyReplacementDelivered, candidate.qtyReplacementDelivered, 0) ||
      !numbersRoughlyEqual(row.qtyPaid, candidate.qtyPaid, 0) ||
      !numbersRoughlyEqual(row.qtyDeferred, candidate.qtyDeferred, 0) ||
      !numbersRoughlyEqual(row.qtyRemade, candidate.qtyRemade, 0) ||
      !numbersRoughlyEqual(row.qtyCancelled, candidate.qtyCancelled, 0) ||
      !numbersRoughlyEqual(row.qtyWaived, candidate.qtyWaived, 0) ||
      !numbersRoughlyEqual(row.grossSales, candidate.grossSales) ||
      !numbersRoughlyEqual(row.netSales, candidate.netSales)
    ) {
      return false;
    }
  }
  return true;
}

function staffCollectionsCompatible(left: StaffPerformanceRow[], right: StaffPerformanceRow[]): boolean {
  if (left.length !== right.length) return false;
  const rightByLabel = new Map(right.map((row) => [row.actorLabel, row]));
  for (const row of left) {
    const candidate = rightByLabel.get(row.actorLabel);
    if (!candidate) return false;
    if (
      !numbersRoughlyEqual(row.submittedQty, candidate.submittedQty, 0) ||
      !numbersRoughlyEqual(row.readyQty, candidate.readyQty, 0) ||
      !numbersRoughlyEqual(row.deliveredQty, candidate.deliveredQty, 0) ||
      !numbersRoughlyEqual(row.replacementDeliveredQty, candidate.replacementDeliveredQty, 0) ||
      !numbersRoughlyEqual(row.remadeQty, candidate.remadeQty, 0) ||
      !numbersRoughlyEqual(row.cancelledQty, candidate.cancelledQty, 0) ||
      !numbersRoughlyEqual(row.waivedQty, candidate.waivedQty, 0) ||
      !numbersRoughlyEqual(row.paymentTotal, candidate.paymentTotal) ||
      !numbersRoughlyEqual(row.cashSales, candidate.cashSales) ||
      !numbersRoughlyEqual(row.deferredSales, candidate.deferredSales) ||
      !numbersRoughlyEqual(row.repaymentTotal, candidate.repaymentTotal) ||
      !numbersRoughlyEqual(row.complaintCount, candidate.complaintCount, 0) ||
      !numbersRoughlyEqual(row.itemIssueCount, candidate.itemIssueCount, 0)
    ) {
      return false;
    }
  }
  return true;
}

function dayCollectionsCompatible(left: ReportBusinessDayRow[], right: ReportBusinessDayRow[]): boolean {
  if (left.length !== right.length) return false;
  const rightByDate = new Map(right.map((row) => [row.businessDate, row]));
  for (const row of left) {
    const candidate = rightByDate.get(row.businessDate);
    if (!candidate) return false;
    if (!totalsCompatible(row, candidate)) {
      return false;
    }
  }
  return true;
}

function buildValidatedSummaryBackedPeriod(input: {
  detail: PeriodReport;
  summaryLike: unknown | null;
  dailyByDate: Map<string, unknown>;
  currentShift: ReportShiftRow | null;
  currentProducts: ProductReportRow[];
  currentStaff: StaffPerformanceRow[];
}): PeriodReport {
  const base = input.detail;
  if (!input.summaryLike) {
    return base;
  }

  const rangeDailyRows = Array.from(input.dailyByDate.entries())
    .filter(([businessDate]) => businessDate >= base.startDate && businessDate <= base.endDate)
    .map(([businessDate, snapshot]) => parseDailySnapshotDayRow(businessDate, snapshot));

  let totals = parseSummaryTotals(input.summaryLike);
  let products = parseSummaryProducts(input.summaryLike);
  let staff = parseSummaryStaff(input.summaryLike);
  let days = mergeDayCollections([], rangeDailyRows);

  if (input.currentShift) {
    const currentBusinessDate = input.currentShift.businessDate;

    if (currentBusinessDate && inDateRange(currentBusinessDate, base.startDate, base.endDate)) {
      const { businessDate: _ignoredBusinessDate, ...currentShiftRest } = input.currentShift;
      const currentDay: ReportBusinessDayRow[] = [
        {
          ...currentShiftRest,
          businessDate: currentBusinessDate,
        },
      ];
      const mergedTotals = { ...totals };
      addTotals(mergedTotals, input.currentShift);
      totals = applySalesReconciliation(mergedTotals);
      products = mergeProductCollections(products, input.currentProducts);
      staff = mergeStaffCollections(staff, input.currentStaff);
      days = mergeDayCollections(days, currentDay);
    }
  }

  const summaryBacked: PeriodReport = {
    ...base,
    totals,
    products,
    staff,
    days,
  };

  if (
    !totalsCompatible(summaryBacked.totals, base.totals) ||
    !productCollectionsCompatible(summaryBacked.products, base.products) ||
    !staffCollectionsCompatible(summaryBacked.staff, base.staff) ||
    !dayCollectionsCompatible(summaryBacked.days, base.days)
  ) {
    return base;
  }

  return summaryBacked;
}

export async function buildReportsWorkspace(cafeId: string, databaseKey: string): Promise<ReportsWorkspace> {
  await ensureRuntimeContract('reporting', databaseKey);

  const referenceDate = cairoToday();
  const ranges = {
    day: { key: 'day' as const, label: 'اليوم', startDate: referenceDate, endDate: referenceDate },
    week: { key: 'week' as const, label: 'الأسبوع', startDate: startOfWeek(referenceDate), endDate: referenceDate },
    month: { key: 'month' as const, label: 'الشهر', startDate: startOfMonth(referenceDate), endDate: referenceDate },
    year: { key: 'year' as const, label: 'السنة', startDate: startOfYear(referenceDate), endDate: referenceDate },
  };

  const [actorMaps, deferredCustomers, summarySnapshots, shiftsResponse] = await Promise.all([
    loadActorMaps(cafeId, databaseKey),
    buildDeferredCustomersWorkspace(cafeId, databaseKey),
    loadSummarySnapshots(cafeId, ranges, databaseKey),
    adminOps(databaseKey)
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

  const snapshotAggregates = await loadSnapshotAggregates(cafeId, shifts, databaseKey);
  const missingClosedIds = shifts
    .filter((row) => row.status === 'closed' && !snapshotAggregates.shiftRowsById.has(row.id))
    .map((row) => row.id);
  const liveShiftRows = shifts.filter((row) => row.status === 'open' || missingClosedIds.includes(row.id));
  const liveAggregates = await loadLiveAggregates(cafeId, liveShiftRows, actorMaps, databaseKey);

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

  const detailPeriods = {
    day: buildPeriodReport({ ...ranges.day, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
    week: buildPeriodReport({ ...ranges.week, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
    month: buildPeriodReport({ ...ranges.month, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
    year: buildPeriodReport({ ...ranges.year, shiftRows, productsByShift: combinedProductsByShift, staffByShift: combinedStaffByShift, complaintsByShift: combinedComplaintsByShift, itemIssuesByShift: combinedItemIssuesByShift }),
  };

  return {
    referenceDate,
    currentShift,
    currentProducts,
    currentStaff,
    currentComplaints,
    currentItemIssues,
    periods: {
      day: buildValidatedSummaryBackedPeriod({
        detail: detailPeriods.day,
        summaryLike: summarySnapshots.dailyByDate.get(ranges.day.startDate) ?? null,
        dailyByDate: summarySnapshots.dailyByDate,
        currentShift,
        currentProducts,
        currentStaff,
      }),
      week: buildValidatedSummaryBackedPeriod({
        detail: detailPeriods.week,
        summaryLike: summarySnapshots.weeklyByStart.get(ranges.week.startDate) ?? null,
        dailyByDate: summarySnapshots.dailyByDate,
        currentShift,
        currentProducts,
        currentStaff,
      }),
      month: buildValidatedSummaryBackedPeriod({
        detail: detailPeriods.month,
        summaryLike: summarySnapshots.monthlyByStart.get(ranges.month.startDate) ?? null,
        dailyByDate: summarySnapshots.dailyByDate,
        currentShift,
        currentProducts,
        currentStaff,
      }),
      year: buildValidatedSummaryBackedPeriod({
        detail: detailPeriods.year,
        summaryLike: summarySnapshots.yearlyByStart.get(ranges.year.startDate) ?? null,
        dailyByDate: summarySnapshots.dailyByDate,
        currentShift,
        currentProducts,
        currentStaff,
      }),
    },
    deferredCustomers: deferredCustomers as DeferredCustomerSummary[],
  };
}
