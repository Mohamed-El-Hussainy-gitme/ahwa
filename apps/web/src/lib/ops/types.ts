export type StationCode = 'barista' | 'shisha';
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
  createdAt?: string;
  notes?: string | null;
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
  qtyReadyForReplacementDelivery?: number;
  availableRemakeQty: number;
  createdAt?: string;
  notes?: string | null;
};
export type WaiterCatalogWorkspace = { sections: OpsSection[]; products: OpsProduct[] };
export type WaiterLiveWorkspace = { shift: OpsShift | null; sessions: OpsSessionSummary[]; readyItems: ReadyItem[]; sessionItems: SessionOrderItem[]; notePresets: string[] };
export type WaiterWorkspace = WaiterLiveWorkspace & WaiterCatalogWorkspace;
export type StationQueueItem = { orderItemId: string; serviceSessionId: string; sessionLabel: string; productName: string; stationCode: StationCode; qtyWaitingOriginal: number; qtyWaitingReplacement: number; qtyWaiting: number; qtyReady: number; qtyDelivered: number; qtyReplacementDelivered: number; createdAt: string; notes?: string | null };
export type StationWorkspace = { shift: OpsShift | null; stationCode: StationCode; queue: StationQueueItem[] };
export type BillableItem = { orderItemId: string; serviceSessionId: string; sessionLabel: string; productName: string; unitPrice: number; qtyBillable: number; qtyDelivered: number; qtyPaid: number; qtyDeferred: number; qtyWaived: number };
export type BillingExtrasSettings = { taxEnabled: boolean; taxRate: number; serviceEnabled: boolean; serviceRate: number };
export type BillingTotals = { subtotal: number; taxAmount: number; serviceAmount: number; total: number };
export type BillingReceiptLine = { orderItemId: string; productName: string; quantity: number; unitPrice: number; lineAmount: number };
export type BillingReceipt = { mode: 'preview' | 'final'; paymentId: string | null; paymentKind: 'cash' | 'deferred' | 'mixed' | 'repayment' | 'adjustment' | 'preview'; sessionId: string; sessionLabel: string; cafeName: string; debtorName: string | null; notes: string | null; createdAt: string; actorLabel: string; totals: BillingTotals; settings: BillingExtrasSettings; lines: BillingReceiptLine[] };
export type BillingSession = { sessionId: string; sessionLabel: string; items: BillableItem[]; totalBillableAmount: number; totalBillableQty: number };
export type BillingWorkspace = { shift: OpsShift | null; sessions: BillingSession[]; deferredNames: string[]; billingSettings: BillingExtrasSettings };
export type OpsQueueHealth = {
  oldestPendingMinutes: number | null;
  oldestReadyMinutes: number | null;
  stalledSessionsCount: number;
  stalledThresholdMinutes: number;
};

export type StaffEmploymentStatus = 'active' | 'inactive' | 'left';

export type DashboardWorkspace = {
  shift: OpsShift | null;
  openSessions: number;
  waitingBarista: number;
  waitingShisha: number;
  readyForDelivery: number;
  billableQty: number;
  deferredOutstanding: number;
  queueHealth: OpsQueueHealth;
};

export type OpsNavSummary = {
  shift: OpsShift | null;
  openSessions: number;
  waitingBarista: number;
  waitingShisha: number;
  readyForDelivery: number;
  billableQty: number;
  deferredOutstanding: number;
  deferredCustomerCount: number;
  queueHealth: OpsQueueHealth;
};

export type MenuWorkspace = {
  sections: OpsSection[];
  products: OpsProduct[];
  billingSettings: BillingExtrasSettings;
};


export type OwnerOnboardingGuideStep = {
  key: 'menu' | 'staff' | 'shift' | 'roles';
  shortLabel: string;
  title: string;
  description: string;
  done: boolean;
};

export type OwnerOnboardingGuide = {
  intro: string;
  sectionsCount: number;
  productsCount: number;
  staffCount: number;
  hasOpenShift: boolean;
  roleAssignmentsCount: number;
  totalCount: number;
  completedCount: number;
  completionPercent: number;
  readyToRun: boolean;
  steps: OwnerOnboardingGuideStep[];
};

export type DeferredCustomerStatus = 'active' | 'late' | 'settled';
export type DeferredAgingBucket = 'today' | 'three_days' | 'week' | 'older' | 'settled';

export type DeferredCustomerSummary = {
  id: string;
  debtorName: string;
  balance: number;
  debtTotal: number;
  repaymentTotal: number;
  lastEntryAt: string | null;
  lastDebtAt: string | null;
  lastRepaymentAt: string | null;
  lastEntryKind: 'debt' | 'repayment' | 'adjustment' | null;
  entryCount: number;
  status: DeferredCustomerStatus;
  agingBucket: DeferredAgingBucket;
  ageDays: number | null;
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
  debtTotal: number;
  repaymentTotal: number;
  entryCount: number;
  lastEntryAt: string | null;
  lastDebtAt: string | null;
  lastRepaymentAt: string | null;
  status: DeferredCustomerStatus;
  agingBucket: DeferredAgingBucket;
  ageDays: number | null;
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
  itemNetSales: number;
  recognizedSales: number;
  salesReconciliationGap: number;
  cashSales: number;
  deferredSales: number;
  taxTotal: number;
  serviceTotal: number;
  extrasTotal: number;
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
  actorKey: string;
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
  complaints: ReportComplaintEntry[];
  itemIssues: ReportItemIssueEntry[];
};

export type ReportsWorkspace = {
  referenceDate: string;
  currentShift: ReportShiftRow | null;
  currentProducts: ProductReportRow[];
  currentStaff: StaffPerformanceRow[];
  currentComplaints: ReportComplaintEntry[];
  currentItemIssues: ReportItemIssueEntry[];
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

export type ReportComplaintEntry = ComplaintRecord & {
  shiftId: string;
  shiftKind: string;
  businessDate: string | null;
};

export type ReportItemIssueEntry = ItemIssueRecord & {
  shiftId: string;
  shiftKind: string;
  businessDate: string | null;
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
  version: 1;
  stream: string;
  cursor: string | null;
  scopes: string[];
};
