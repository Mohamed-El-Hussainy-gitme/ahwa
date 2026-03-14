export type StationCode = 'barista' | 'shisha' | 'service';
export type OpsShift = { id: string; kind: string; status: string; openedAt: string };
export type OpsSessionSummary = { id: string; label: string; status: string; openedAt: string; billableCount: number; readyCount: number };
export type OpsSection = { id: string; title: string; stationCode: StationCode; sortOrder: number; isActive?: boolean };
export type OpsProduct = { id: string; sectionId: string; name: string; stationCode: StationCode; unitPrice: number; sortOrder: number; isActive?: boolean; isAvailable?: boolean };
export type ReadyItem = {
  orderItemId: string;
  serviceSessionId: string;
  sessionLabel: string;
  productName: string;
  stationCode: StationCode;
  qtyReadyForNormalDelivery: number;
  qtyReadyForReplacementDelivery: number;
  qtyReadyForDelivery: number;
};
export type SessionOrderItem = {
  orderItemId: string;
  serviceSessionId: string;
  sessionLabel: string;
  productName: string;
  stationCode: StationCode;
  unitPrice: number;
  qtyTotal: number;
  qtyReady: number;
  qtyDelivered: number;
  qtyReplacementDelivered: number;
  qtyPaid: number;
  qtyDeferred: number;
  qtyWaived: number;
  qtyCancelled: number;
  qtyRemade: number;
  qtyReadyForDelivery: number;
  availableRemakeQty: number;
};
export type WaiterWorkspace = { shift: OpsShift | null; sessions: OpsSessionSummary[]; sections: OpsSection[]; products: OpsProduct[]; readyItems: ReadyItem[]; sessionItems: SessionOrderItem[] };
export type StationQueueItem = { orderItemId: string; serviceSessionId: string; sessionLabel: string; productName: string; stationCode: StationCode; qtyWaitingOriginal: number; qtyWaitingReplacement: number; qtyWaiting: number; qtyReady: number; qtyDelivered: number; qtyReplacementDelivered: number; createdAt: string };
export type StationWorkspace = { shift: OpsShift | null; stationCode: StationCode; queue: StationQueueItem[] };
export type BillableItem = { orderItemId: string; serviceSessionId: string; sessionLabel: string; productName: string; unitPrice: number; qtyBillable: number; qtyDelivered: number; qtyPaid: number; qtyDeferred: number; qtyWaived: number };
export type BillingSession = { sessionId: string; sessionLabel: string; items: BillableItem[]; totalBillableAmount: number; totalBillableQty: number };
export type BillingWorkspace = { shift: OpsShift | null; sessions: BillingSession[]; deferredNames: string[] };
export type DashboardWorkspace = { shift: OpsShift | null; openSessions: number; waitingBarista: number; waitingShisha: number; readyForDelivery: number; billableQty: number; deferredOutstanding: number };

export type MenuWorkspace = {
  sections: OpsSection[];
  products: OpsProduct[];
};

export type DeferredCustomerSummary = {
  id: string;
  debtorName: string;
  balance: number;
  debtTotal: number;
  repaymentTotal: number;
  lastEntryAt: string | null;
  entryCount: number;
};

export type DeferredLedgerEntry = {
  id: string;
  debtorName: string;
  entryKind: 'debt' | 'repayment' | 'adjustment';
  amount: number;
  notes: string | null;
  createdAt: string;
  paymentId: string | null;
  serviceSessionId: string | null;
  actorLabel: string | null;
};

export type DeferredCustomerLedgerWorkspace = {
  debtorName: string;
  balance: number;
  entries: DeferredLedgerEntry[];
};

export type ReportPeriodKey = 'day' | 'week' | 'month' | 'year';

export type ReportTotals = {
  shiftCount: number;
  submittedQty: number;
  readyQty: number;
  deliveredQty: number;
  replacementDeliveredQty: number;
  paidQty: number;
  deferredQty: number;
  remadeQty: number;
  cancelledQty: number;
  waivedQty: number;
  netSales: number;
  cashSales: number;
  deferredSales: number;
  repaymentTotal: number;
  complaintTotal: number;
  complaintOpen: number;
  complaintResolved: number;
  complaintDismissed: number;
  complaintRemake: number;
  complaintCancel: number;
  complaintWaive: number;
  itemIssueTotal: number;
  itemIssueNote: number;
  itemIssueRemake: number;
  itemIssueCancel: number;
  itemIssueWaive: number;
  openSessions: number;
  closedSessions: number;
  totalSessions: number;
};

export type ReportShiftRow = ReportTotals & {
  shiftId: string;
  kind: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  businessDate: string | null;
};

export type ReportBusinessDayRow = ReportTotals & {
  businessDate: string;
};

export type ProductReportRow = {
  productId: string;
  productName: string;
  stationCode: StationCode;
  qtySubmitted: number;
  qtyReady: number;
  qtyDelivered: number;
  qtyReplacementDelivered: number;
  qtyPaid: number;
  qtyDeferred: number;
  qtyRemade: number;
  qtyCancelled: number;
  qtyWaived: number;
  grossSales: number;
  netSales: number;
};

export type StaffPerformanceRow = {
  actorLabel: string;
  submittedQty: number;
  readyQty: number;
  deliveredQty: number;
  replacementDeliveredQty: number;
  remadeQty: number;
  cancelledQty: number;
  waivedQty: number;
  paymentTotal: number;
  cashSales: number;
  deferredSales: number;
  repaymentTotal: number;
  complaintCount: number;
  itemIssueCount: number;
};

export type PeriodReport = {
  key: ReportPeriodKey;
  label: string;
  startDate: string;
  endDate: string;
  totals: ReportTotals;
  days: ReportBusinessDayRow[];
  shifts: ReportShiftRow[];
  products: ProductReportRow[];
  staff: StaffPerformanceRow[];
};

export type ReportsWorkspace = {
  referenceDate: string;
  currentShift: ReportShiftRow | null;
  currentProducts: ProductReportRow[];
  currentStaff: StaffPerformanceRow[];
  periods: Record<ReportPeriodKey, PeriodReport>;
  deferredCustomers: DeferredCustomerSummary[];
};

export type ComplaintResolutionKind = 'resolved' | 'dismissed' | null;

export type ComplaintItemCandidate = {
  orderItemId: string;
  serviceSessionId: string;
  sessionLabel: string;
  productName: string;
  stationCode: StationCode;
  unitPrice: number;
  availableCancelQty: number;
  availableRemakeQty: number;
  availableWaiveQty: number;
  qtyDelivered: number;
  qtyReplacementDelivered: number;
  qtyPaid: number;
  qtyDeferred: number;
  qtyWaived: number;
};


export type ComplaintSessionOption = {
  id: string;
  label: string;
};

export type ItemIssueActionKind = 'note' | 'remake' | 'cancel_undelivered' | 'waive_delivered';

export type ItemIssueStatus = 'logged' | 'applied' | 'dismissed';

export type ItemIssueRecord = {
  id: string;
  orderItemId: string;
  serviceSessionId: string;
  sessionLabel: string;
  productName: string;
  stationCode: StationCode | null;
  issueKind: 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other';
  actionKind: ItemIssueActionKind;
  status: ItemIssueStatus;
  requestedQuantity: number | null;
  resolvedQuantity: number | null;
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  createdByLabel: string | null;
  resolvedByLabel: string | null;
};
export type ComplaintRecord = {
  id: string;
  orderItemId: string | null;
  serviceSessionId: string;
  sessionLabel: string;
  productName: string | null;
  stationCode: StationCode | null;
  complaintKind: 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other';
  status: 'open' | 'resolved' | 'dismissed';
  resolutionKind: ComplaintResolutionKind;
  requestedQuantity: number | null;
  resolvedQuantity: number | null;
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  createdByLabel: string | null;
  resolvedByLabel: string | null;
};

export type ComplaintsWorkspace = {
  shift: OpsShift | null;
  sessions: ComplaintSessionOption[];
  items: ComplaintItemCandidate[];
  complaints: ComplaintRecord[];
  itemIssues: ItemIssueRecord[];
};

export type OpsRealtimeEvent = {
  id: string;
  type: string;
  cafeId: string;
  shiftId: string | null;
  entityId: string | null;
  at: string;
  data?: Record<string, unknown>;
};
