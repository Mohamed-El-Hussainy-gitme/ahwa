export type StationCode = 'barista' | 'shisha';
export type OpsShift = { id: string; kind: string; status: string; openedAt: string };
export type LinkedCustomerSummary = { id: string; fullName: string; phoneRaw: string; favoriteDrinkLabel: string | null };
export type RecentSessionLabel = { label: string; lastUsedAt: string | null; usageCount: number };
export type OpsSessionSummary = { id: string; label: string; status: string; openedAt: string; billableCount: number; readyCount: number; linkedCustomer?: LinkedCustomerSummary | null };
export type OpsSection = { id: string; title: string; stationCode: StationCode; sortOrder: number; isActive?: boolean };
export type OpsProduct = { id: string; sectionId: string; name: string; stationCode: StationCode; unitPrice: number; sortOrder: number; isActive?: boolean; isAvailable?: boolean };
export type MenuAddon = { id: string; name: string; stationCode: StationCode; unitPrice: number; sortOrder: number; isActive?: boolean };
export type ProductAddonLink = { productId: string; addonId: string };
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
export type WaiterCatalogWorkspace = { sections: OpsSection[]; products: OpsProduct[]; addons: MenuAddon[]; productAddonLinks: ProductAddonLink[] };
export type WaiterLiveWorkspace = { shift: OpsShift | null; sessions: OpsSessionSummary[]; readyItems: ReadyItem[]; sessionItems: SessionOrderItem[]; notePresets: string[]; recentSessionLabels: RecentSessionLabel[] };
export type WaiterWorkspace = WaiterLiveWorkspace & WaiterCatalogWorkspace;
export type StationQueueItem = { orderItemId: string; serviceSessionId: string; sessionLabel: string; productName: string; stationCode: StationCode; qtyWaitingOriginal: number; qtyWaitingReplacement: number; qtyWaiting: number; qtyReady: number; qtyDelivered: number; qtyReplacementDelivered: number; createdAt: string; notes?: string | null };
export type StationWorkspace = { shift: OpsShift | null; stationCode: StationCode; queue: StationQueueItem[] };
export type BillableItem = { orderItemId: string; serviceSessionId: string; sessionLabel: string; productName: string; unitPrice: number; qtyBillable: number; qtyDelivered: number; qtyPaid: number; qtyDeferred: number; qtyWaived: number; notes?: string | null };
export type BillingExtrasSettings = { taxEnabled: boolean; taxRate: number; serviceEnabled: boolean; serviceRate: number };
export type BillingTotals = { subtotal: number; taxAmount: number; serviceAmount: number; total: number };
export type BillingReceiptLineAddon = { addonName: string; quantity: number; unitPrice: number; lineAmount: number };
export type BillingReceiptLine = { orderItemId: string; productName: string; quantity: number; unitPrice: number; baseUnitPrice: number; baseLineAmount: number; lineAmount: number; addons: BillingReceiptLineAddon[]; notes?: string | null };
export type BillingReceipt = { mode: 'preview' | 'final'; paymentId: string | null; paymentKind: 'cash' | 'deferred' | 'mixed' | 'repayment' | 'adjustment' | 'preview'; sessionId: string; sessionLabel: string; cafeName: string; debtorName: string | null; notes: string | null; createdAt: string; actorLabel: string; totals: BillingTotals; settings: BillingExtrasSettings; lines: BillingReceiptLine[] };
export type BillingSession = { sessionId: string; sessionLabel: string; items: BillableItem[]; totalBillableAmount: number; totalBillableQty: number; linkedCustomer?: LinkedCustomerSummary | null };
export type BillingWorkspace = { shift: OpsShift | null; sessions: BillingSession[]; deferredNames: string[]; billingSettings: BillingExtrasSettings };
export type OperatingSettings = { businessDayStartTime: string; businessDayStartMinutes: number; timezone: string; currentBusinessDate: string; operationalWindowLabel: string };
export type CustomerProfile = {
  id: string;
  fullName: string;
  normalizedName: string;
  phoneRaw: string;
  phoneNormalized: string;
  address: string | null;
  favoriteDrinkLabel: string | null;
  notes: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDirectoryWorkspace = {
  items: CustomerProfile[];
};

export type CustomerAliasSource = 'manual' | 'deferred_runtime' | 'billing_runtime' | 'imported';

export type CustomerAlias = {
  id: string;
  aliasText: string;
  normalizedAlias: string;
  source: CustomerAliasSource;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerActivityLinkSource = 'deferred_payment' | 'deferred_session' | 'manual';

export type CustomerActivityLink = {
  id: string;
  paymentId: string | null;
  serviceSessionId: string | null;
  linkSource: CustomerActivityLinkSource;
  linkedAt: string;
  notes: string | null;
};

export type CustomerDeferredAggregate = {
  outstandingBalance: number;
  debtTotal: number;
  repaymentTotal: number;
  entryCount: number;
  activeAliases: number;
  lastEntryAt: string | null;
};

export type CustomerRecentSession = {
  serviceSessionId: string;
  sessionLabel: string;
  debtorName: string | null;
  totalAmount: number;
  openedAt: string;
  closedAt: string | null;
  paymentCreatedAt: string | null;
};

export type CustomerRecommendedProduct = {
  productName: string;
  count: number;
  quantity: number;
  lastOrderedAt: string | null;
};

export type CustomerRecommendedAddon = {
  addonName: string;
  count: number;
  quantity: number;
  lastOrderedAt: string | null;
};

export type CustomerRecommendedNote = {
  noteText: string;
  count: number;
  lastUsedAt: string | null;
};

export type CustomerRecommendedBasket = {
  label: string;
  count: number;
  itemCount: number;
  lastOrderedAt: string | null;
};

export type CustomerIntelligenceWorkspace = {
  customer: CustomerProfile;
  aliases: CustomerAlias[];
  deferredSummary: CustomerDeferredAggregate;
  recentLedger: DeferredLedgerEntry[];
  recentSessions: CustomerRecentSession[];
  recentLinks: CustomerActivityLink[];
  recommendedProducts: CustomerRecommendedProduct[];
  recommendedAddons: CustomerRecommendedAddon[];
  recommendedNotes: CustomerRecommendedNote[];
  recommendedBaskets: CustomerRecommendedBasket[];
};


export type InventoryStockStatus = 'ok' | 'low' | 'empty' | 'inactive';
export type InventoryMovementKind = 'inbound' | 'outbound' | 'waste' | 'adjustment';

export type InventoryItem = {
  id: string;
  itemName: string;
  normalizedName: string;
  itemCode: string | null;
  categoryLabel: string | null;
  unitLabel: string;
  purchaseUnitLabel: string | null;
  purchaseToStockFactor: number;
  currentBalance: number;
  lowStockThreshold: number;
  notes: string | null;
  isActive: boolean;
  lastMovementAt: string | null;
  createdAt: string;
  updatedAt: string;
  stockStatus: InventoryStockStatus;
};

export type InventorySupplier = {
  id: string;
  supplierName: string;
  normalizedName: string;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryMovement = {
  id: string;
  inventoryItemId: string;
  itemName: string;
  supplierId: string | null;
  supplierName: string | null;
  movementKind: InventoryMovementKind;
  deltaQuantity: number;
  unitLabel: string;
  inputQuantity: number | null;
  inputUnitLabel: string | null;
  conversionFactor: number | null;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
};

export type InventoryMenuProductSummary = {
  id: string;
  name: string;
  stationCode: StationCode;
  isActive: boolean;
};

export type InventoryMenuAddonSummary = {
  id: string;
  name: string;
  stationCode: StationCode;
  isActive: boolean;
};

export type InventoryProductRecipe = {
  id: string;
  menuProductId: string;
  productName: string;
  stationCode: StationCode;
  inventoryItemId: string;
  inventoryItemName: string;
  unitLabel: string;
  quantityPerUnit: number;
  wastagePercent: number;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type InventoryAddonRecipe = {
  id: string;
  menuAddonId: string;
  addonName: string;
  stationCode: StationCode;
  inventoryItemId: string;
  inventoryItemName: string;
  unitLabel: string;
  quantityPerUnit: number;
  wastagePercent: number;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type InventoryEstimatedConsumptionItem = {
  inventoryItemId: string;
  itemName: string;
  unitLabel: string;
  currentBalance: number;
  lowStockThreshold: number;
  stockStatus: InventoryStockStatus;
  estimatedFromProducts: number;
  estimatedFromAddons: number;
  estimatedTotal: number;
  recordedOutflow: number;
  varianceQuantity: number;
  avgDailyConsumption: number;
  coverageDays: number | null;
  recipeCount: number;
};

export type ShiftInventorySnapshotLine = {
  inventoryItemId: string;
  itemName: string;
  unitLabel: string;
  currentBalance: number;
  lowStockThreshold: number;
  stockStatus: InventoryStockStatus;
  fromProducts: number;
  fromAddons: number;
  remakeWasteQty: number;
  remakeReplacementQty: number;
  totalConsumption: number;
  recipeSourcesCount: number;
};

export type ShiftInventorySnapshotProduct = {
  menuProductId: string;
  productName: string;
  stationCode: StationCode;
  acceptedOriginalQty: number;
  remakeWasteQty: number;
  remakeReplacementQty: number;
  totalPreparedQty: number;
  estimatedConsumptionQty: number;
  recipeLinesCount: number;
};

export type ShiftInventorySnapshotAddon = {
  menuAddonId: string;
  addonName: string;
  stationCode: StationCode;
  acceptedOriginalQty: number;
  remakeWasteQty: number;
  remakeReplacementQty: number;
  totalPreparedQty: number;
  estimatedConsumptionQty: number;
  recipeLinesCount: number;
};

export type ShiftInventoryPostingSummary = {
  isPosted: boolean;
  postingId: string | null;
  postedAt: string | null;
  postedByOwnerId: string | null;
  totalInventoryItems: number;
  totalConsumptionQty: number;
  movementCount: number;
  alreadyPosted: boolean;
};

export type ShiftInventorySnapshot = {
  id: string;
  shiftId: string;
  businessDate: string | null;
  shiftKind: string | null;
  shiftStatus: string;
  snapshotPhase: 'preview' | 'closed';
  generatedAt: string;
  posting: ShiftInventoryPostingSummary;
  summary: {
    totalInventoryItems: number;
    totalConsumptionQty: number;
    productConsumptionQty: number;
    addonConsumptionQty: number;
    remakeWasteQty: number;
    remakeReplacementQty: number;
    coveredProductsCount: number;
    coveredAddonsCount: number;
  };
  lines: ShiftInventorySnapshotLine[];
  products: ShiftInventorySnapshotProduct[];
  addons: ShiftInventorySnapshotAddon[];
};

export type InventoryWorkspace = {
  items: InventoryItem[];
  suppliers: InventorySupplier[];
  recentMovements: InventoryMovement[];
  menuProducts: InventoryMenuProductSummary[];
  menuAddons: InventoryMenuAddonSummary[];
  productRecipes: InventoryProductRecipe[];
  addonRecipes: InventoryAddonRecipe[];
  estimatedConsumption: InventoryEstimatedConsumptionItem[];
  recentShiftSnapshots: ShiftInventorySnapshot[];
  analysisWindowDays: number;
};

export type ShiftKind = 'morning' | 'evening';
export type ShiftRoleCode = 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter';
export type ShiftTemplateAssignment = { userId: string; role: ShiftRoleCode; actorType: 'owner' | 'staff'; fullName: string | null; isActive: boolean; employmentStatus?: StaffEmploymentStatus };
export type ShiftAssignmentTemplate = { id: string; kind: ShiftKind; label: string; updatedAt: string; assignments: ShiftTemplateAssignment[]; availableAssignmentsCount: number; inactiveAssignmentsCount: number };
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
  addons: MenuAddon[];
  productAddonLinks: ProductAddonLink[];
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
export type CustomReportPeriodKey = 'range';

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
  addonSales: number;
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

export type AddonReportRow = {
  addonId: string;
  addonName: string;
  stationCode: StationCode;
  usageCount: number;
  linkedOrderItems: number;
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
  addons: AddonReportRow[];
  staff: StaffPerformanceRow[];
  complaints: ReportComplaintEntry[];
  itemIssues: ReportItemIssueEntry[];
};

export type CustomRangeReport = Omit<PeriodReport, 'key' | 'label'> & {
  key: CustomReportPeriodKey;
  label: string;
};

export type ReportsWorkspace = {
  referenceDate: string;
  operatingSettings: OperatingSettings;
  currentShift: ReportShiftRow | null;
  currentProducts: ProductReportRow[];
  currentAddons: AddonReportRow[];
  currentStaff: StaffPerformanceRow[];
  currentComplaints: ReportComplaintEntry[];
  currentItemIssues: ReportItemIssueEntry[];
  periods: Record<ReportPeriodKey, PeriodReport>;
  customRange: CustomRangeReport | null;
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
