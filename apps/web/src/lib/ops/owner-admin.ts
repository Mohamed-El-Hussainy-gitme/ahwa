import type {
  CustomerActivityLink,
  CustomerAlias,
  CustomerAliasSource,
  CustomerIntelligenceWorkspace,
  CustomerProfile,
  LinkedCustomerSummary,
  RecentSessionLabel,
  CustomerRecommendedAddon,
  CustomerRecommendedBasket,
  CustomerRecommendedNote,
  CustomerRecommendedProduct,
  CustomerRecentSession,
  DeferredLedgerEntry,
  OperatingSettings,
  ShiftAssignmentTemplate,
} from '@/lib/ops/types';
import { describeBusinessDayWindow, formatBusinessDayStartTime, normalizeBusinessDayStartMinutes, resolveBusinessDate, currentTimeZoneDate } from '@/lib/ops/business-day';
import { normalizeCustomerName } from '@/lib/ops/customers';
import { parseOrderItemNotes } from '@/lib/ops/orderItemNotes';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

export type ShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter';

type CafeDatabaseScope = {
  cafeId: string;
  databaseKey: string;
};


export type OwnerAccountLabel = 'owner' | 'partner' | 'branch_manager';

export async function listOwnerAccounts(scope: CafeDatabaseScope, includeInactive = true) {
  let query = ops(scope.databaseKey)
    .from('owner_users')
    .select('id, full_name, phone, owner_label, is_active, created_at')
    .eq('cafe_id', scope.cafeId)
    .order('created_at', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    fullName: item.full_name ? String(item.full_name) : null,
    phone: item.phone ? String(item.phone) : null,
    ownerLabel: item.owner_label === 'partner' ? 'partner' : item.owner_label === 'branch_manager' ? 'branch_manager' : 'owner' as OwnerAccountLabel,
    isActive: !!item.is_active,
    createdAt: String(item.created_at),
  }));
}

export async function createManagementAccount(input: CafeDatabaseScope & {
  actorOwnerId: string;
  fullName: string;
  phone: string;
  password: string;
  ownerLabel?: OwnerAccountLabel;
}) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_create_management_account', {
    p_cafe_id: input.cafeId,
    p_actor_owner_id: input.actorOwnerId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_password: input.password,
    p_owner_label: input.ownerLabel ?? 'branch_manager',
  });
  if (rpc.error) throw rpc.error;
  const payload = (rpc.data ?? {}) as { owner_user_id?: string | null; owner_label?: string | null };
  const ownerUserId = String(payload.owner_user_id ?? '').trim();
  if (!ownerUserId) throw new Error('MANAGEMENT_ACCOUNT_CREATE_FAILED');
  return {
    ownerUserId,
    ownerLabel: payload.owner_label === 'partner' ? 'partner' : payload.owner_label === 'branch_manager' ? 'branch_manager' : 'owner' as OwnerAccountLabel,
  };
}

function ops(databaseKey: string) {
  return supabaseAdminForDatabase(databaseKey).schema('ops');
}

export function currentCairoDate(): string {
  return currentTimeZoneDate();
}

export async function loadOperatingSettings(scope: CafeDatabaseScope): Promise<OperatingSettings> {
  const { data, error } = await ops(scope.databaseKey)
    .from('cafe_operating_settings')
    .select('business_day_start_minutes, timezone_name')
    .eq('cafe_id', scope.cafeId)
    .maybeSingle();

  if (error) throw error;

  const businessDayStartMinutes = normalizeBusinessDayStartMinutes(data?.business_day_start_minutes ?? 0);
  const timezone = data?.timezone_name ? String(data.timezone_name) : 'Africa/Cairo';
  const currentBusinessDate = resolveBusinessDate(new Date(), businessDayStartMinutes, timezone);

  return {
    businessDayStartTime: formatBusinessDayStartTime(businessDayStartMinutes),
    businessDayStartMinutes,
    timezone,
    currentBusinessDate,
    operationalWindowLabel: describeBusinessDayWindow(businessDayStartMinutes),
  } satisfies OperatingSettings;
}

export async function listCustomerProfiles(scope: CafeDatabaseScope, includeInactive = true): Promise<CustomerProfile[]> {
  let query = ops(scope.databaseKey)
    .from('customers')
    .select('id, full_name, normalized_name, phone_raw, phone_normalized, address, favorite_drink_label, notes, is_active, last_seen_at, created_at, updated_at')
    .eq('cafe_id', scope.cafeId)
    .order('updated_at', { ascending: false })
    .order('full_name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    fullName: String(item.full_name ?? ''),
    normalizedName: String(item.normalized_name ?? ''),
    phoneRaw: String(item.phone_raw ?? ''),
    phoneNormalized: String(item.phone_normalized ?? ''),
    address: item.address ? String(item.address) : null,
    favoriteDrinkLabel: item.favorite_drink_label ? String(item.favorite_drink_label) : null,
    notes: item.notes ? String(item.notes) : null,
    isActive: !!item.is_active,
    lastSeenAt: item.last_seen_at ? String(item.last_seen_at) : null,
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at),
  }) satisfies CustomerProfile);
}

export async function createCustomerProfile(input: CafeDatabaseScope & {
  actorOwnerId: string;
  fullName: string;
  normalizedName: string;
  phoneRaw: string;
  phoneNormalized: string;
  address?: string | null;
  favoriteDrinkLabel?: string | null;
  notes?: string | null;
}) {
  const timestamp = new Date().toISOString();
  const { data, error } = await ops(input.databaseKey)
    .from('customers')
    .insert({
      cafe_id: input.cafeId,
      full_name: input.fullName,
      normalized_name: input.normalizedName,
      phone_raw: input.phoneRaw,
      phone_normalized: input.phoneNormalized,
      address: input.address ?? null,
      favorite_drink_label: input.favoriteDrinkLabel ?? null,
      notes: input.notes ?? null,
      updated_at: timestamp,
      updated_by_owner_id: input.actorOwnerId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return String(data.id);
}

export async function updateCustomerProfile(input: CafeDatabaseScope & {
  actorOwnerId: string;
  customerId: string;
  fullName: string;
  normalizedName: string;
  phoneRaw: string;
  phoneNormalized: string;
  address?: string | null;
  favoriteDrinkLabel?: string | null;
  notes?: string | null;
}) {
  const { error } = await ops(input.databaseKey)
    .from('customers')
    .update({
      full_name: input.fullName,
      normalized_name: input.normalizedName,
      phone_raw: input.phoneRaw,
      phone_normalized: input.phoneNormalized,
      address: input.address ?? null,
      favorite_drink_label: input.favoriteDrinkLabel ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.customerId);

  if (error) throw error;
}

export async function setCustomerProfileActive(input: CafeDatabaseScope & {
  actorOwnerId: string;
  customerId: string;
  isActive: boolean;
}) {
  const { error } = await ops(input.databaseKey)
    .from('customers')
    .update({
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.customerId);

  if (error) throw error;
}


function mapCustomerProfileRow(item: Record<string, unknown>): CustomerProfile {
  return {
    id: String(item.id ?? ''),
    fullName: String(item.full_name ?? ''),
    normalizedName: String(item.normalized_name ?? ''),
    phoneRaw: String(item.phone_raw ?? ''),
    phoneNormalized: String(item.phone_normalized ?? ''),
    address: item.address ? String(item.address) : null,
    favoriteDrinkLabel: item.favorite_drink_label ? String(item.favorite_drink_label) : null,
    notes: item.notes ? String(item.notes) : null,
    isActive: !!item.is_active,
    lastSeenAt: item.last_seen_at ? String(item.last_seen_at) : null,
    createdAt: String(item.created_at ?? ''),
    updatedAt: String(item.updated_at ?? ''),
  } satisfies CustomerProfile;
}

function mapAliasSource(value: unknown): CustomerAliasSource {
  return value === 'deferred_runtime'
    ? 'deferred_runtime'
    : value === 'billing_runtime'
      ? 'billing_runtime'
      : value === 'imported'
        ? 'imported'
        : 'manual';
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function customerLinkPriority(linkSource: string | null | undefined) {
  switch (linkSource) {
    case 'manual':
      return 4;
    case 'deferred_session':
      return 3;
    case 'deferred_payment':
      return 2;
    default:
      return 1;
  }
}

export async function loadSessionCustomerLookup(scope: CafeDatabaseScope, sessionIds: string[]): Promise<Map<string, LinkedCustomerSummary>> {
  const normalizedSessionIds = uniqueStrings(sessionIds);
  if (!normalizedSessionIds.length) return new Map();

  const { data: linkRows, error: linkError } = await ops(scope.databaseKey)
    .from('customer_links')
    .select('service_session_id, customer_id, link_source, linked_at')
    .eq('cafe_id', scope.cafeId)
    .in('service_session_id', normalizedSessionIds)
    .order('linked_at', { ascending: false });
  if (linkError) throw linkError;

  const bestBySession = new Map<string, { customerId: string; priority: number; linkedAt: string }>();
  for (const row of linkRows ?? []) {
    const serviceSessionId = row.service_session_id ? String(row.service_session_id) : '';
    const customerId = row.customer_id ? String(row.customer_id) : '';
    if (!serviceSessionId || !customerId) continue;
    const nextPriority = customerLinkPriority(row.link_source ? String(row.link_source) : null);
    const linkedAt = row.linked_at ? String(row.linked_at) : '';
    const current = bestBySession.get(serviceSessionId);
    if (!current || nextPriority > current.priority || (nextPriority === current.priority && linkedAt > current.linkedAt)) {
      bestBySession.set(serviceSessionId, { customerId, priority: nextPriority, linkedAt });
    }
  }

  const customerIds = uniqueStrings([...bestBySession.values()].map((item) => item.customerId));
  if (!customerIds.length) return new Map();

  const { data: customerRows, error: customerError } = await ops(scope.databaseKey)
    .from('customers')
    .select('id, full_name, phone_raw, favorite_drink_label')
    .eq('cafe_id', scope.cafeId)
    .in('id', customerIds);
  if (customerError) throw customerError;

  const customersById = new Map((customerRows ?? []).map((row) => [String(row.id ?? ''), {
    id: String(row.id ?? ''),
    fullName: String(row.full_name ?? ''),
    phoneRaw: String(row.phone_raw ?? ''),
    favoriteDrinkLabel: row.favorite_drink_label ? String(row.favorite_drink_label) : null,
  } satisfies LinkedCustomerSummary]));

  const result = new Map<string, LinkedCustomerSummary>();
  for (const [serviceSessionId, item] of bestBySession.entries()) {
    const customer = customersById.get(item.customerId);
    if (customer) result.set(serviceSessionId, customer);
  }

  return result;
}

export async function listRecentSessionLabels(scope: CafeDatabaseScope): Promise<RecentSessionLabel[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('service_sessions')
    .select('session_label, opened_at')
    .eq('cafe_id', scope.cafeId)
    .order('opened_at', { ascending: false })
    .limit(120);
  if (error) throw error;

  const labels = new Map<string, RecentSessionLabel>();
  for (const row of data ?? []) {
    const label = String(row.session_label ?? '').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const existing = labels.get(label);
    if (existing) {
      existing.usageCount += 1;
      if (row.opened_at) {
        const nextUsedAt = String(row.opened_at);
        if (!existing.lastUsedAt || nextUsedAt > existing.lastUsedAt) {
          existing.lastUsedAt = nextUsedAt;
        }
      }
      continue;
    }
    labels.set(label, {
      label,
      lastUsedAt: row.opened_at ? String(row.opened_at) : null,
      usageCount: 1,
    });
  }

  return [...labels.values()]
    .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '') || right.usageCount - left.usageCount || left.label.localeCompare(right.label, 'ar'))
    .slice(0, 10);
}

export async function linkCustomerToCurrentSession(input: CafeDatabaseScope & {
  customerId: string;
  serviceSessionId: string;
  actorOwnerId?: string | null;
  actorStaffId?: string | null;
}) {
  const normalizedSessionId = String(input.serviceSessionId ?? '').trim();
  const normalizedCustomerId = String(input.customerId ?? '').trim();
  if (!normalizedSessionId || !normalizedCustomerId) {
    throw new Error('INVALID_CUSTOMER_SESSION_LINK');
  }

  const { data: sessionRow, error: sessionError } = await ops(input.databaseKey)
    .from('service_sessions')
    .select('id')
    .eq('cafe_id', input.cafeId)
    .eq('id', normalizedSessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow?.id) throw new Error('SESSION_NOT_FOUND');

  const { error: deleteError } = await ops(input.databaseKey)
    .from('customer_links')
    .delete()
    .eq('cafe_id', input.cafeId)
    .eq('service_session_id', normalizedSessionId)
    .eq('link_source', 'manual');
  if (deleteError) throw deleteError;

  await createCustomerActivityLink({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    customerId: normalizedCustomerId,
    serviceSessionId: normalizedSessionId,
    linkSource: 'manual',
    actorOwnerId: input.actorOwnerId ?? null,
    actorStaffId: input.actorStaffId ?? null,
  });

  await touchCustomerProfileActivity({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    customerId: normalizedCustomerId,
    actorOwnerId: input.actorOwnerId ?? null,
  });
}

export async function unlinkCustomerFromCurrentSession(input: CafeDatabaseScope & { serviceSessionId: string }) {
  const normalizedSessionId = String(input.serviceSessionId ?? '').trim();
  if (!normalizedSessionId) {
    throw new Error('INVALID_CUSTOMER_SESSION_LINK');
  }
  const { error } = await ops(input.databaseKey)
    .from('customer_links')
    .delete()
    .eq('cafe_id', input.cafeId)
    .eq('service_session_id', normalizedSessionId)
    .eq('link_source', 'manual');
  if (error) throw error;
}

export async function getCustomerProfile(scope: CafeDatabaseScope, customerId: string): Promise<CustomerProfile | null> {
  const { data, error } = await ops(scope.databaseKey)
    .from('customers')
    .select('id, full_name, normalized_name, phone_raw, phone_normalized, address, favorite_drink_label, notes, is_active, last_seen_at, created_at, updated_at')
    .eq('cafe_id', scope.cafeId)
    .eq('id', customerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapCustomerProfileRow(data as Record<string, unknown>);
}

export async function findCustomerByReference(scope: CafeDatabaseScope, input: { customerId?: string | null; debtorName?: string | null; includeInactive?: boolean }): Promise<CustomerProfile | null> {
  const requestedCustomerId = String(input.customerId ?? '').trim();
  const includeInactive = Boolean(input.includeInactive);
  if (requestedCustomerId) {
    const customer = await getCustomerProfile(scope, requestedCustomerId);
    if (!customer) return null;
    if (!includeInactive && !customer.isActive) return null;
    return customer;
  }

  const normalizedReference = normalizeCustomerName(String(input.debtorName ?? ''));
  if (!normalizedReference) return null;

  const aliasQuery = ops(scope.databaseKey)
    .from('customer_aliases')
    .select('customer_id')
    .eq('cafe_id', scope.cafeId)
    .eq('normalized_alias', normalizedReference)
    .maybeSingle();

  const { data: aliasData, error: aliasError } = await aliasQuery;
  if (aliasError) throw aliasError;

  if (aliasData?.customer_id) {
    const customer = await getCustomerProfile(scope, String(aliasData.customer_id));
    if (!customer) return null;
    if (!includeInactive && !customer.isActive) return null;
    return customer;
  }

  let query = ops(scope.databaseKey)
    .from('customers')
    .select('id, full_name, normalized_name, phone_raw, phone_normalized, address, favorite_drink_label, notes, is_active, last_seen_at, created_at, updated_at')
    .eq('cafe_id', scope.cafeId)
    .eq('normalized_name', normalizedReference)
    .limit(2);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  return mapCustomerProfileRow(data[0] as Record<string, unknown>);
}

export async function listCustomerAliases(scope: CafeDatabaseScope, customerId: string): Promise<CustomerAlias[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('customer_aliases')
    .select('id, alias_text, normalized_alias, source, usage_count, last_used_at, created_at, updated_at')
    .eq('cafe_id', scope.cafeId)
    .eq('customer_id', customerId)
    .order('usage_count', { ascending: false })
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id ?? ''),
    aliasText: String(item.alias_text ?? ''),
    normalizedAlias: String(item.normalized_alias ?? ''),
    source: mapAliasSource(item.source),
    usageCount: Number(item.usage_count ?? 0),
    lastUsedAt: item.last_used_at ? String(item.last_used_at) : null,
    createdAt: String(item.created_at ?? ''),
    updatedAt: String(item.updated_at ?? ''),
  }) satisfies CustomerAlias);
}

export async function saveCustomerAlias(input: CafeDatabaseScope & {
  customerId: string;
  aliasText: string;
  source: CustomerAliasSource;
  markUsed?: boolean;
}) {
  const normalizedAlias = normalizeCustomerName(input.aliasText);
  if (!normalizedAlias) {
    throw new Error('INVALID_CUSTOMER_ALIAS');
  }

  const now = new Date().toISOString();
  const { data: customerData, error: customerError } = await ops(input.databaseKey)
    .from('customers')
    .select('normalized_name')
    .eq('cafe_id', input.cafeId)
    .eq('id', input.customerId)
    .single();
  if (customerError) throw customerError;
  const normalizedCustomerName = String(customerData?.normalized_name ?? '').trim();
  if (normalizedAlias === normalizedCustomerName) {
    return null;
  }

  const { data: existing, error: existingError } = await ops(input.databaseKey)
    .from('customer_aliases')
    .select('id, customer_id, usage_count, last_used_at')
    .eq('cafe_id', input.cafeId)
    .eq('normalized_alias', normalizedAlias)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    if (String(existing.customer_id ?? '') !== input.customerId) {
      const conflict = new Error('CUSTOMER_ALIAS_EXISTS');
      (conflict as Error & { code?: string }).code = 'CUSTOMER_ALIAS_EXISTS';
      throw conflict;
    }

    const usageCount = Number(existing.usage_count ?? 0) + (input.markUsed ? 1 : 0);
    const { error } = await ops(input.databaseKey)
      .from('customer_aliases')
      .update({
        alias_text: input.aliasText,
        source: input.source,
        usage_count: usageCount,
        last_used_at: input.markUsed ? now : (existing.last_used_at ? String(existing.last_used_at) : null),
        updated_at: now,
      })
      .eq('cafe_id', input.cafeId)
      .eq('id', String(existing.id));
    if (error) throw error;
    return String(existing.id);
  }

  const { data, error } = await ops(input.databaseKey)
    .from('customer_aliases')
    .insert({
      cafe_id: input.cafeId,
      customer_id: input.customerId,
      alias_text: input.aliasText,
      normalized_alias: normalizedAlias,
      source: input.source,
      usage_count: input.markUsed ? 1 : 0,
      last_used_at: input.markUsed ? now : null,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) throw error;
  return String(data.id ?? '');
}

export async function deleteCustomerAlias(input: CafeDatabaseScope & { customerId: string; aliasId: string }) {
  const { error } = await ops(input.databaseKey)
    .from('customer_aliases')
    .delete()
    .eq('cafe_id', input.cafeId)
    .eq('customer_id', input.customerId)
    .eq('id', input.aliasId);

  if (error) throw error;
}

export async function touchCustomerProfileActivity(input: CafeDatabaseScope & { customerId: string; actorOwnerId?: string | null }) {
  const now = new Date().toISOString();
  const { error } = await ops(input.databaseKey)
    .from('customers')
    .update({
      last_seen_at: now,
      updated_at: now,
      updated_by_owner_id: input.actorOwnerId ?? null,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.customerId);

  if (error) throw error;
}

export async function createCustomerActivityLink(input: CafeDatabaseScope & {
  customerId: string;
  paymentId?: string | null;
  serviceSessionId?: string | null;
  linkSource: 'deferred_payment' | 'deferred_session' | 'manual';
  actorOwnerId?: string | null;
  actorStaffId?: string | null;
  notes?: string | null;
}) {
  const paymentId = String(input.paymentId ?? '').trim() || null;
  const serviceSessionId = String(input.serviceSessionId ?? '').trim() || null;
  if (!paymentId && !serviceSessionId) return;

  let existingId: string | null = null;

  if (paymentId) {
    const { data, error } = await ops(input.databaseKey)
      .from('customer_links')
      .select('id')
      .eq('cafe_id', input.cafeId)
      .eq('customer_id', input.customerId)
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (error) throw error;
    existingId = data?.id ? String(data.id) : null;
  }

  if (!existingId && serviceSessionId) {
    const { data, error } = await ops(input.databaseKey)
      .from('customer_links')
      .select('id')
      .eq('cafe_id', input.cafeId)
      .eq('customer_id', input.customerId)
      .eq('service_session_id', serviceSessionId)
      .maybeSingle();
    if (error) throw error;
    existingId = data?.id ? String(data.id) : null;
  }

  if (existingId) return;

  const { error } = await ops(input.databaseKey)
    .from('customer_links')
    .insert({
      cafe_id: input.cafeId,
      customer_id: input.customerId,
      payment_id: paymentId,
      service_session_id: serviceSessionId,
      link_source: input.linkSource,
      linked_by_owner_id: input.actorOwnerId ?? null,
      linked_by_staff_id: input.actorStaffId ?? null,
      notes: input.notes ?? null,
    });

  if (error) throw error;
}

export async function linkCustomerByDeferredName(input: CafeDatabaseScope & {
  debtorName: string;
  customerId?: string | null;
  paymentId?: string | null;
  serviceSessionId?: string | null;
  actorOwnerId?: string | null;
  actorStaffId?: string | null;
  source: 'deferred_runtime' | 'billing_runtime';
}) {
  const debtorName = String(input.debtorName ?? '').replace(/\s+/g, ' ').trim();
  if (!debtorName) return null;

  const customer = await findCustomerByReference(input, {
    customerId: input.customerId,
    debtorName,
    includeInactive: false,
  });

  if (!customer) return null;

  await saveCustomerAlias({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    customerId: customer.id,
    aliasText: debtorName,
    source: input.source,
    markUsed: true,
  });

  await touchCustomerProfileActivity({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    customerId: customer.id,
    actorOwnerId: input.actorOwnerId ?? null,
  });

  await createCustomerActivityLink({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    customerId: customer.id,
    paymentId: input.paymentId ?? null,
    serviceSessionId: input.serviceSessionId ?? null,
    linkSource: input.paymentId ? 'deferred_payment' : 'deferred_session',
    actorOwnerId: input.actorOwnerId ?? null,
    actorStaffId: input.actorStaffId ?? null,
  });

  return customer;
}

export async function loadCustomerIntelligence(scope: CafeDatabaseScope, customerId: string): Promise<CustomerIntelligenceWorkspace> {
  const customer = await getCustomerProfile(scope, customerId);
  if (!customer) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }

  const aliases = await listCustomerAliases(scope, customerId);
  const deferredNames = uniqueStrings([customer.fullName, ...aliases.map((alias) => alias.aliasText)]);

  const deferredSummary = {
    outstandingBalance: 0,
    debtTotal: 0,
    repaymentTotal: 0,
    entryCount: 0,
    activeAliases: 0,
    lastEntryAt: null as string | null,
  };

  let recentLedger: DeferredLedgerEntry[] = [];

  if (deferredNames.length > 0) {
    const { data: balanceRows, error: balanceError } = await ops(scope.databaseKey)
      .from('deferred_customer_balances')
      .select('debtor_name, balance, debt_total, repayment_total, entry_count, last_entry_at')
      .eq('cafe_id', scope.cafeId)
      .in('debtor_name', deferredNames);
    if (balanceError) throw balanceError;

    for (const row of balanceRows ?? []) {
      deferredSummary.outstandingBalance += Number(row.balance ?? 0);
      deferredSummary.debtTotal += Number(row.debt_total ?? 0);
      deferredSummary.repaymentTotal += Number(row.repayment_total ?? 0);
      deferredSummary.entryCount += Number(row.entry_count ?? 0);
      deferredSummary.activeAliases += 1;
      const lastEntryAt = row.last_entry_at ? String(row.last_entry_at) : null;
      if (lastEntryAt && (!deferredSummary.lastEntryAt || lastEntryAt > deferredSummary.lastEntryAt)) {
        deferredSummary.lastEntryAt = lastEntryAt;
      }
    }

    const { data: ledgerRows, error: ledgerError } = await ops(scope.databaseKey)
      .from('deferred_ledger_entries')
      .select('id, debtor_name, entry_kind, amount, notes, created_at, payment_id, service_session_id, by_staff_id, by_owner_id')
      .eq('cafe_id', scope.cafeId)
      .in('debtor_name', deferredNames)
      .order('created_at', { ascending: false })
      .limit(25);
    if (ledgerError) throw ledgerError;

    recentLedger = (ledgerRows ?? []).map((row) => ({
      id: String(row.id ?? ''),
      debtorName: String(row.debtor_name ?? ''),
      entryKind: row.entry_kind === 'debt' ? 'debt' : row.entry_kind === 'repayment' ? 'repayment' : 'adjustment',
      amount: Number(row.amount ?? 0),
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at ?? ''),
      paymentId: row.payment_id ? String(row.payment_id) : null,
      serviceSessionId: row.service_session_id ? String(row.service_session_id) : null,
      actorLabel: row.by_owner_id ? 'owner' : row.by_staff_id ? 'staff' : null,
    }) satisfies DeferredLedgerEntry);
  }

  const { data: linkRows, error: linksError } = await ops(scope.databaseKey)
    .from('customer_links')
    .select('id, payment_id, service_session_id, link_source, linked_at, notes')
    .eq('cafe_id', scope.cafeId)
    .eq('customer_id', customerId)
    .order('linked_at', { ascending: false })
    .limit(40);
  if (linksError) throw linksError;

  const recentLinks = (linkRows ?? []).map((row) => ({
    id: String(row.id ?? ''),
    paymentId: row.payment_id ? String(row.payment_id) : null,
    serviceSessionId: row.service_session_id ? String(row.service_session_id) : null,
    linkSource: row.link_source === 'deferred_session' ? 'deferred_session' : row.link_source === 'manual' ? 'manual' : 'deferred_payment',
    linkedAt: String(row.linked_at ?? ''),
    notes: row.notes ? String(row.notes) : null,
  }) satisfies CustomerActivityLink);

  let deferredPayments: Array<Record<string, unknown>> = [];
  if (deferredNames.length > 0) {
    const { data, error } = await ops(scope.databaseKey)
      .from('payments')
      .select('id, service_session_id, debtor_name, total_amount, created_at, payment_kind')
      .eq('cafe_id', scope.cafeId)
      .eq('payment_kind', 'deferred')
      .in('debtor_name', deferredNames)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    deferredPayments = (data ?? []) as Array<Record<string, unknown>>;
  }

  const linkedSessionIds = uniqueStrings([
    ...recentLinks.map((link) => link.serviceSessionId),
    ...recentLedger.map((entry) => entry.serviceSessionId),
  ]);

  const allSessionIds = uniqueStrings([
    ...deferredPayments.map((row) => row.service_session_id ? String(row.service_session_id) : null),
    ...linkedSessionIds,
  ]);

  let paymentRows: Array<Record<string, unknown>> = [];
  if (allSessionIds.length > 0) {
    const { data, error } = await ops(scope.databaseKey)
      .from('payments')
      .select('id, service_session_id, debtor_name, total_amount, created_at, payment_kind')
      .eq('cafe_id', scope.cafeId)
      .in('service_session_id', allSessionIds)
      .neq('payment_kind', 'repayment')
      .order('created_at', { ascending: false });
    if (error) throw error;
    paymentRows = (data ?? []) as Array<Record<string, unknown>>;
  }

  let sessionRows: Array<Record<string, unknown>> = [];
  if (allSessionIds.length > 0) {
    const { data, error } = await ops(scope.databaseKey)
      .from('service_sessions')
      .select('id, session_label, opened_at, closed_at')
      .eq('cafe_id', scope.cafeId)
      .in('id', allSessionIds);
    if (error) throw error;
    sessionRows = (data ?? []) as Array<Record<string, unknown>>;
  }
  const sessionMap = new Map(sessionRows.map((row) => [String(row.id ?? ''), row]));

  let orderItemRows: Array<Record<string, unknown>> = [];
  if (allSessionIds.length > 0) {
    const { data, error } = await ops(scope.databaseKey)
      .from('order_items')
      .select('id, service_session_id, menu_product_id, notes, created_at, qty_total, qty_delivered')
      .eq('cafe_id', scope.cafeId)
      .in('service_session_id', allSessionIds)
      .order('created_at', { ascending: false });
    if (error) throw error;
    orderItemRows = (data ?? []) as Array<Record<string, unknown>>;
  }

  const orderItemIds = uniqueStrings(orderItemRows.map((row) => row.id ? String(row.id) : null));
  const productIds = uniqueStrings(orderItemRows.map((row) => row.menu_product_id ? String(row.menu_product_id) : null));

  let productRows: Array<Record<string, unknown>> = [];
  if (productIds.length > 0) {
    const { data, error } = await ops(scope.databaseKey)
      .from('menu_products')
      .select('id, product_name')
      .eq('cafe_id', scope.cafeId)
      .in('id', productIds);
    if (error) throw error;
    productRows = (data ?? []) as Array<Record<string, unknown>>;
  }
  const productMap = new Map(productRows.map((row) => [String(row.id ?? ''), String(row.product_name ?? '')]));

  let addonRows: Array<Record<string, unknown>> = [];
  if (orderItemIds.length > 0) {
    const { data, error } = await ops(scope.databaseKey)
      .from('order_item_addons')
      .select('order_item_id, addon_name_snapshot, quantity')
      .eq('cafe_id', scope.cafeId)
      .in('order_item_id', orderItemIds);
    if (error) throw error;
    addonRows = (data ?? []) as Array<Record<string, unknown>>;
  }
  const addonsByItemId = new Map<string, Array<Record<string, unknown>>>();
  for (const row of addonRows) {
    const orderItemId = row.order_item_id ? String(row.order_item_id) : '';
    if (!orderItemId) continue;
    const current = addonsByItemId.get(orderItemId);
    if (current) current.push(row);
    else addonsByItemId.set(orderItemId, [row]);
  }

  const paymentsBySessionId = new Map<string, Array<Record<string, unknown>>>();
  for (const row of paymentRows) {
    const serviceSessionId = row.service_session_id ? String(row.service_session_id) : '';
    if (!serviceSessionId) continue;
    const current = paymentsBySessionId.get(serviceSessionId);
    if (current) current.push(row);
    else paymentsBySessionId.set(serviceSessionId, [row]);
  }

  const sessionOrderItems = new Map<string, Array<Record<string, unknown>>>();
  for (const row of orderItemRows) {
    const serviceSessionId = row.service_session_id ? String(row.service_session_id) : '';
    if (!serviceSessionId) continue;
    const current = sessionOrderItems.get(serviceSessionId);
    if (current) current.push(row);
    else sessionOrderItems.set(serviceSessionId, [row]);
  }

  const productAgg = new Map<string, CustomerRecommendedProduct>();
  const addonAgg = new Map<string, CustomerRecommendedAddon>();
  const noteAgg = new Map<string, CustomerRecommendedNote>();
  const basketAgg = new Map<string, CustomerRecommendedBasket>();

  for (const serviceSessionId of allSessionIds) {
    const items = sessionOrderItems.get(serviceSessionId) ?? [];
    const basketLines: string[] = [];
    for (const row of items) {
      const orderItemId = String(row.id ?? '');
      const menuProductId = String(row.menu_product_id ?? '');
      const productName = productMap.get(menuProductId) || 'صنف غير معروف';
      const createdAt = String(row.created_at ?? '');
      const quantity = Math.max(Number(row.qty_delivered ?? 0), Number(row.qty_total ?? 0), 0);

      const currentProduct = productAgg.get(productName) ?? { productName, count: 0, quantity: 0, lastOrderedAt: null };
      currentProduct.count += 1;
      currentProduct.quantity += quantity;
      if (createdAt && (!currentProduct.lastOrderedAt || createdAt > currentProduct.lastOrderedAt)) {
        currentProduct.lastOrderedAt = createdAt;
      }
      productAgg.set(productName, currentProduct);

      const parsedNotes = parseOrderItemNotes(row.notes ? String(row.notes) : null);
      if (parsedNotes.freeformNotes) {
        const currentNote = noteAgg.get(parsedNotes.freeformNotes) ?? { noteText: parsedNotes.freeformNotes, count: 0, lastUsedAt: null };
        currentNote.count += 1;
        if (createdAt && (!currentNote.lastUsedAt || createdAt > currentNote.lastUsedAt)) {
          currentNote.lastUsedAt = createdAt;
        }
        noteAgg.set(parsedNotes.freeformNotes, currentNote);
      }

      const basketLabelParts = [productName];
      const itemAddons = addonsByItemId.get(orderItemId) ?? [];
      for (const addon of itemAddons) {
        const addonName = String(addon.addon_name_snapshot ?? '').trim();
        if (!addonName) continue;
        const addonQuantity = Number(addon.quantity ?? 0);
        const currentAddon = addonAgg.get(addonName) ?? { addonName, count: 0, quantity: 0, lastOrderedAt: null };
        currentAddon.count += 1;
        currentAddon.quantity += addonQuantity;
        if (createdAt && (!currentAddon.lastOrderedAt || createdAt > currentAddon.lastOrderedAt)) {
          currentAddon.lastOrderedAt = createdAt;
        }
        addonAgg.set(addonName, currentAddon);
        basketLabelParts.push(`+ ${addonName}`);
      }

      if (parsedNotes.freeformNotes) {
        basketLabelParts.push(`(${parsedNotes.freeformNotes})`);
      }

      basketLines.push(basketLabelParts.join(' '));
    }

    if (basketLines.length > 0) {
      const normalized = [...basketLines].sort((left, right) => left.localeCompare(right, 'ar')).join(' • ');
      const session = sessionMap.get(serviceSessionId);
      const createdAt = session?.opened_at ? String(session.opened_at) : null;
      const currentBasket = basketAgg.get(normalized) ?? { label: normalized, count: 0, itemCount: 0, lastOrderedAt: null };
      currentBasket.count += 1;
      currentBasket.itemCount = Math.max(currentBasket.itemCount, basketLines.length);
      if (createdAt && (!currentBasket.lastOrderedAt || createdAt > currentBasket.lastOrderedAt)) {
        currentBasket.lastOrderedAt = createdAt;
      }
      basketAgg.set(normalized, currentBasket);
    }
  }

  const recentSessions = allSessionIds
    .map((serviceSessionId) => {
      const session = sessionMap.get(serviceSessionId);
      if (!session) return null;
      const sessionPayments = paymentsBySessionId.get(serviceSessionId) ?? [];
      const totalAmount = sessionPayments.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
      const deferredPayment = sessionPayments.find((row) => String(row.payment_kind ?? '') === 'deferred');
      const paymentCreatedAt = sessionPayments.reduce<string | null>((latest, row) => {
        const createdAt = row.created_at ? String(row.created_at) : null;
        if (!createdAt) return latest;
        return !latest || createdAt > latest ? createdAt : latest;
      }, null);
      return {
        serviceSessionId,
        sessionLabel: String(session.session_label ?? serviceSessionId),
        debtorName: deferredPayment?.debtor_name ? String(deferredPayment.debtor_name) : null,
        totalAmount,
        openedAt: String(session.opened_at ?? ''),
        closedAt: session.closed_at ? String(session.closed_at) : null,
        paymentCreatedAt,
      } satisfies CustomerRecentSession;
    })
    .filter((item): item is CustomerRecentSession => !!item)
    .sort((left, right) => (right.paymentCreatedAt ?? right.openedAt).localeCompare(left.paymentCreatedAt ?? left.openedAt))
    .slice(0, 12);

  const recommendedProducts = [...productAgg.values()]
    .sort((left, right) => right.count - left.count || right.quantity - left.quantity || left.productName.localeCompare(right.productName, 'ar'))
    .slice(0, 8);

  const recommendedAddons = [...addonAgg.values()]
    .sort((left, right) => right.count - left.count || right.quantity - left.quantity || left.addonName.localeCompare(right.addonName, 'ar'))
    .slice(0, 8);

  const recommendedNotes = [...noteAgg.values()]
    .sort((left, right) => right.count - left.count || left.noteText.localeCompare(right.noteText, 'ar'))
    .slice(0, 8);

  const recommendedBaskets = [...basketAgg.values()]
    .sort((left, right) => right.count - left.count || right.itemCount - left.itemCount || left.label.localeCompare(right.label, 'ar'))
    .slice(0, 6);

  return {
    customer,
    aliases,
    deferredSummary,
    recentLedger,
    recentSessions,
    recentLinks,
    recommendedProducts,
    recommendedAddons,
    recommendedNotes,
    recommendedBaskets,
  } satisfies CustomerIntelligenceWorkspace;
}

export async function listStaffMembers(scope: CafeDatabaseScope, includeInactive = false) {
  let query = ops(scope.databaseKey)
    .from('staff_members')
    .select('id, full_name, employee_code, is_active, employment_status, created_at')
    .eq('cafe_id', scope.cafeId)
    .order('created_at', { ascending: false });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    fullName: item.full_name ? String(item.full_name) : null,
    employeeCode: item.employee_code ? String(item.employee_code) : null,
    isActive: !!item.is_active,
    employmentStatus: item.employment_status ? String(item.employment_status) as 'active' | 'inactive' | 'left' : (!!item.is_active ? 'active' : 'inactive'),
    createdAt: String(item.created_at),
  }));
}

export async function createStaffMember(input: CafeDatabaseScope & {
  fullName: string;
  pin: string;
  employeeCode?: string | null;
}) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_create_staff_member_v2', {
    p_cafe_id: input.cafeId,
    p_full_name: input.fullName,
    p_pin: input.pin,
    p_employee_code: input.employeeCode ?? null,
  });
  if (rpc.error) throw rpc.error;
  const staffId = String((rpc.data as { staff_member_id?: string } | null)?.staff_member_id ?? '');
  if (!staffId) throw new Error('STAFF_CREATE_FAILED');
  return staffId;
}

export async function setStaffMemberActive(input: CafeDatabaseScope & { staffMemberId: string; isActive: boolean }) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_set_staff_member_active', {
    p_cafe_id: input.cafeId,
    p_staff_member_id: input.staffMemberId,
    p_is_active: input.isActive,
  });
  if (rpc.error) throw rpc.error;
}

export async function setStaffMemberStatus(input: CafeDatabaseScope & {
  staffMemberId: string;
  employmentStatus: 'active' | 'inactive' | 'left';
}) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_set_staff_member_status', {
    p_cafe_id: input.cafeId,
    p_staff_member_id: input.staffMemberId,
    p_employment_status: input.employmentStatus,
  });
  if (rpc.error) throw rpc.error;
}

export async function setStaffMemberPin(input: CafeDatabaseScope & { staffMemberId: string; pin: string }) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_set_staff_member_pin', {
    p_cafe_id: input.cafeId,
    p_staff_member_id: input.staffMemberId,
    p_pin: input.pin,
  });
  if (rpc.error) throw rpc.error;
}

export type CurrentShiftState = {
  shift: null | {
    id: string;
    kind: 'morning' | 'evening';
    businessDate: string | null;
    status: 'open' | 'closed';
    openedAt: string | null;
    closedAt: string | null;
    notes: string | null;
  };
  assignments: Array<{
    id: string;
    userId: string;
    role: ShiftRole;
    fullName: string | null;
    isActive: boolean;
    actorType: 'owner' | 'staff';
  }>;
};

type ShiftKind = 'morning' | 'evening';

function templateLabelForKind(kind: ShiftKind) {
  return kind === 'morning' ? 'النمط الصباحي الافتراضي' : 'النمط المسائي الافتراضي';
}

function assertShiftAssignmentsValid(assignments: Array<{ userId: string; role: ShiftRole; actorType?: 'staff' | 'owner' }>) {
  const supervisorCount = assignments.filter((item) => item.role === 'supervisor').length;
  if (supervisorCount !== 1) {
    throw new Error('supervisor_required');
  }

  const baristaCount = assignments.filter((item) => item.role === 'barista').length;
  if (baristaCount > 1) {
    throw new Error('multiple_baristas_not_allowed');
  }

  const seen = new Set<string>();
  for (const assignment of assignments) {
    const actorType = assignment.actorType === 'owner' ? 'owner' : 'staff';
    const dedupeKey = `${actorType}:${assignment.userId}`;
    if (seen.has(dedupeKey)) {
      throw new Error('duplicate_shift_assignment');
    }
    seen.add(dedupeKey);
  }
}

export async function listShiftAssignmentTemplates(scope: CafeDatabaseScope): Promise<ShiftAssignmentTemplate[]> {
  const admin = ops(scope.databaseKey);
  const { data: templateRows, error: templateError } = await admin
    .from('shift_assignment_templates')
    .select('id, shift_kind, template_label, updated_at')
    .eq('cafe_id', scope.cafeId)
    .order('shift_kind', { ascending: true });

  if (templateError) throw templateError;

  const templates = (templateRows ?? []).map((item) => ({
    id: String(item.id),
    kind: item.shift_kind as ShiftKind,
    label: item.template_label ? String(item.template_label) : templateLabelForKind(item.shift_kind as ShiftKind),
    updatedAt: item.updated_at ? String(item.updated_at) : new Date(0).toISOString(),
  }));

  if (templates.length === 0) {
    return [];
  }

  const templateIds = templates.map((item) => item.id);
  const { data: memberRows, error: memberError } = await admin
    .from('shift_assignment_template_members')
    .select('template_id, role_code, staff_member_id, owner_user_id, sort_order')
    .eq('cafe_id', scope.cafeId)
    .in('template_id', templateIds)
    .order('sort_order', { ascending: true });

  if (memberError) throw memberError;

  const staffIds = Array.from(new Set((memberRows ?? []).map((item) => item.staff_member_id).filter(Boolean).map(String)));
  const ownerIds = Array.from(new Set((memberRows ?? []).map((item) => item.owner_user_id).filter(Boolean).map(String)));

  const [staffRows, ownerRows] = await Promise.all([
    staffIds.length > 0
      ? admin.from('staff_members').select('id, full_name, is_active, employment_status').eq('cafe_id', scope.cafeId).in('id', staffIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length > 0
      ? admin.from('owner_users').select('id, full_name, is_active').eq('cafe_id', scope.cafeId).in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (staffRows.error) throw staffRows.error;
  if (ownerRows.error) throw ownerRows.error;

  const staffById = new Map((staffRows.data ?? []).map((item) => [String(item.id), {
    fullName: item.full_name ? String(item.full_name) : null,
    isActive: !!item.is_active,
    employmentStatus: item.employment_status ? String(item.employment_status) as 'active' | 'inactive' | 'left' : (!!item.is_active ? 'active' : 'inactive'),
  }]));

  const ownerById = new Map((ownerRows.data ?? []).map((item) => [String(item.id), {
    fullName: item.full_name ? String(item.full_name) : null,
    isActive: !!item.is_active,
  }]));

  const membersByTemplateId = new Map<string, ShiftAssignmentTemplate['assignments']>();
  for (const row of memberRows ?? []) {
    const templateId = String(row.template_id ?? '');
    if (!templateId) continue;

    const ownerId = row.owner_user_id ? String(row.owner_user_id) : null;
    const staffId = row.staff_member_id ? String(row.staff_member_id) : null;
    const actorType = ownerId ? 'owner' as const : 'staff' as const;
    const userId = ownerId ?? staffId ?? '';
    if (!userId) continue;

    const owner = ownerId ? ownerById.get(ownerId) ?? null : null;
    const staff = staffId ? staffById.get(staffId) ?? null : null;
    const isActive = actorType === 'owner' ? (owner?.isActive ?? false) : !!staff?.isActive && (staff?.employmentStatus ?? 'inactive') === 'active';

    const entry = {
      userId,
      role: row.role_code as ShiftRole,
      actorType,
      fullName: actorType === 'owner' ? owner?.fullName ?? null : staff?.fullName ?? null,
      isActive,
      employmentStatus: actorType === 'staff' ? (staff?.employmentStatus ?? 'inactive') : undefined,
    };

    const bucket = membersByTemplateId.get(templateId) ?? [];
    bucket.push(entry);
    membersByTemplateId.set(templateId, bucket);
  }

  return templates.map((template) => {
    const assignments = membersByTemplateId.get(template.id) ?? [];
    return {
      ...template,
      assignments,
      availableAssignmentsCount: assignments.filter((item) => item.isActive).length,
      inactiveAssignmentsCount: assignments.filter((item) => !item.isActive).length,
    } satisfies ShiftAssignmentTemplate;
  });
}

export async function saveShiftAssignmentTemplate(input: CafeDatabaseScope & {
  kind: ShiftKind;
  assignments: Array<{ userId: string; role: ShiftRole; actorType?: 'staff' | 'owner' }>;
}) {
  assertShiftAssignmentsValid(input.assignments);

  const admin = ops(input.databaseKey);
  const timestamp = new Date().toISOString();
  const { data: templateRow, error: templateError } = await admin
    .from('shift_assignment_templates')
    .upsert({
      cafe_id: input.cafeId,
      shift_kind: input.kind,
      template_label: templateLabelForKind(input.kind),
      updated_at: timestamp,
    }, { onConflict: 'cafe_id,shift_kind' })
    .select('id, shift_kind, template_label, updated_at')
    .single();

  if (templateError) throw templateError;

  const templateId = String(templateRow.id ?? '');
  if (!templateId) {
    throw new Error('SHIFT_TEMPLATE_SAVE_FAILED');
  }

  const { error: deleteError } = await admin
    .from('shift_assignment_template_members')
    .delete()
    .eq('cafe_id', input.cafeId)
    .eq('template_id', templateId);

  if (deleteError) throw deleteError;

  if (input.assignments.length > 0) {
    const rows = input.assignments.map((assignment, index) => ({
      cafe_id: input.cafeId,
      template_id: templateId,
      role_code: assignment.role,
      staff_member_id: assignment.actorType === 'owner' ? null : assignment.userId,
      owner_user_id: assignment.actorType === 'owner' ? assignment.userId : null,
      sort_order: index,
    }));

    const { error: insertError } = await admin.from('shift_assignment_template_members').insert(rows);
    if (insertError) throw insertError;
  }

  const templates = await listShiftAssignmentTemplates(input);
  return templates.find((item) => item.kind === input.kind) ?? null;
}

export async function deleteShiftAssignmentTemplate(input: CafeDatabaseScope & { kind: ShiftKind }) {
  const admin = ops(input.databaseKey);
  const { error } = await admin
    .from('shift_assignment_templates')
    .delete()
    .eq('cafe_id', input.cafeId)
    .eq('shift_kind', input.kind);

  if (error) throw error;
}

export async function readCurrentShiftState(scope: CafeDatabaseScope): Promise<CurrentShiftState> {
  const admin = ops(scope.databaseKey);
  const { data: shift, error: shiftError } = await admin
    .from('shifts')
    .select('id, shift_kind, business_date, status, opened_at, closed_at, notes')
    .eq('cafe_id', scope.cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftError) throw shiftError;
  if (!shift) {
    return { shift: null, assignments: [] };
  }

  const shiftId = String(shift.id);

  const { data: assignments, error: assignmentsError } = await admin
    .from('shift_role_assignments')
    .select('id, role_code, staff_member_id, owner_user_id, is_active, assigned_at')
    .eq('cafe_id', scope.cafeId)
    .eq('shift_id', shiftId)
    .eq('is_active', true)
    .order('assigned_at', { ascending: true });

  if (assignmentsError) throw assignmentsError;

  const staffIds = Array.from(new Set((assignments ?? []).map((item) => item.staff_member_id).filter(Boolean).map(String)));
  const ownerIds = Array.from(new Set((assignments ?? []).map((item) => item.owner_user_id).filter(Boolean).map(String)));

  const [staffRows, ownerRows] = await Promise.all([
    staffIds.length > 0
      ? admin.from('staff_members').select('id, full_name').eq('cafe_id', scope.cafeId).in('id', staffIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length > 0
      ? admin.from('owner_users').select('id, full_name').eq('cafe_id', scope.cafeId).in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (staffRows.error) throw staffRows.error;
  if (ownerRows.error) throw ownerRows.error;

  const staffNameById = new Map((staffRows.data ?? []).map((item) => [String(item.id), item.full_name ? String(item.full_name) : null]));
  const ownerNameById = new Map((ownerRows.data ?? []).map((item) => [String(item.id), item.full_name ? String(item.full_name) : null]));

  return {
    shift: {
      id: shiftId,
      kind: shift.shift_kind as 'morning' | 'evening',
      businessDate: shift.business_date ? String(shift.business_date) : null,
      status: shift.status as 'open' | 'closed',
      openedAt: shift.opened_at ? String(shift.opened_at) : null,
      closedAt: shift.closed_at ? String(shift.closed_at) : null,
      notes: shift.notes ? String(shift.notes) : null,
    },
    assignments: (assignments ?? []).map((item) => {
      const staffId = item.staff_member_id ? String(item.staff_member_id) : null;
      const ownerId = item.owner_user_id ? String(item.owner_user_id) : null;
      return {
        id: String(item.id),
        userId: staffId ?? ownerId ?? '',
        role: item.role_code as ShiftRole,
        fullName: staffId ? staffNameById.get(staffId) ?? null : ownerId ? ownerNameById.get(ownerId) ?? null : null,
        isActive: !!item.is_active,
        actorType: staffId ? 'staff' : 'owner',
      };
    }),
  };
}

export async function listShiftHistory(scope: CafeDatabaseScope, limit = 50) {
  const { data, error } = await ops(scope.databaseKey)
    .from('shifts')
    .select('id, shift_kind, status, opened_at, closed_at')
    .eq('cafe_id', scope.cafeId)
    .order('opened_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    kind: item.shift_kind as 'morning' | 'evening',
    isOpen: item.status === 'open',
    startedAt: item.opened_at ? String(item.opened_at) : null,
    endedAt: item.closed_at ? String(item.closed_at) : null,
  }));
}

export async function updateOpenShiftAssignments(input: CafeDatabaseScope & {
  shiftId: string;
  assignments: Array<{ userId: string; role: ShiftRole; actorType?: 'staff' | 'owner' }>;
}) {
  const admin = ops(input.databaseKey);
  const { error: deactivateError } = await admin
    .from('shift_role_assignments')
    .update({ is_active: false })
    .eq('cafe_id', input.cafeId)
    .eq('shift_id', input.shiftId)
    .eq('is_active', true);
  if (deactivateError) throw deactivateError;

  if (!input.assignments.length) return;

  const rows = input.assignments.map((assignment) => ({
    cafe_id: input.cafeId,
    shift_id: input.shiftId,
    role_code: assignment.role,
    staff_member_id: assignment.actorType === 'owner' ? null : assignment.userId,
    owner_user_id: assignment.actorType === 'owner' ? assignment.userId : null,
    is_active: true,
  }));

  const { error: insertError } = await admin.from('shift_role_assignments').insert(rows);
  if (insertError) throw insertError;
}

export async function openShiftWithAssignments(input: CafeDatabaseScope & {
  ownerUserId: string;
  kind: 'morning' | 'evening';
  notes?: string | null;
  assignments: Array<{ userId: string; role: ShiftRole; actorType?: 'staff' | 'owner' }>;
}) {
  assertShiftAssignmentsValid(input.assignments);
  const admin = supabaseAdminForDatabase(input.databaseKey);
  const operatingSettings = await loadOperatingSettings(input);
  const openRpc = await admin.rpc('ops_open_shift_with_assignments', {
    p_cafe_id: input.cafeId,
    p_shift_kind: input.kind,
    p_business_date: operatingSettings.currentBusinessDate,
    p_opened_by_owner_id: input.ownerUserId,
    p_notes: input.notes ?? null,
    p_assignments: input.assignments.map((assignment) =>
      assignment.actorType === 'owner'
        ? {
            role: assignment.role,
            actorType: 'owner',
            userId: assignment.userId,
            owner_user_id: assignment.userId,
          }
        : {
            role: assignment.role,
            actorType: 'staff',
            userId: assignment.userId,
            staff_member_id: assignment.userId,
          },
    ),
  });
  if (openRpc.error) throw openRpc.error;

  const rpcData = (openRpc.data as { shift_id?: string; mode?: string } | null) ?? null;
  const shiftId = String(rpcData?.shift_id ?? '');
  if (!shiftId) throw new Error('SHIFT_OPEN_FAILED');

  return {
    shiftId,
    mode:
      rpcData?.mode === 'resumed_open' || rpcData?.mode === 'resumed_closed'
        ? rpcData.mode
        : 'created',
  } as const;
}

async function autoCloseClosableSessions(input: {
  cafeId: string;
  databaseKey: string;
  shiftId: string;
  ownerUserId: string;
}) {
  const admin = ops(input.databaseKey);
  const { data: sessions, error: sessionsError } = await admin
    .from('service_sessions')
    .select('id')
    .eq('cafe_id', input.cafeId)
    .eq('shift_id', input.shiftId)
    .eq('status', 'open');

  if (sessionsError) throw sessionsError;

  for (const session of sessions ?? []) {
    const sessionId = String((session as { id?: string | null }).id ?? '');
    if (!sessionId) continue;

    const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_close_service_session', {
      p_cafe_id: input.cafeId,
      p_service_session_id: sessionId,
      p_by_owner_id: input.ownerUserId,
      p_notes: null,
    });

    if (!rpc.error) continue;

    const message = String(rpc.error.message ?? '');
    const expectedFailure = /service session/i.test(message) || /waiting quantity/i.test(message) || /ready quantity/i.test(message) || /billable quantity/i.test(message);
    if (!expectedFailure) {
      throw rpc.error;
    }
  }
}

export async function closeShift(input: CafeDatabaseScope & {
  shiftId: string;
  ownerUserId: string;
  notes?: string | null;
}) {
  await autoCloseClosableSessions({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    shiftId: input.shiftId,
    ownerUserId: input.ownerUserId,
  });

  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_close_shift', {
    p_cafe_id: input.cafeId,
    p_shift_id: input.shiftId,
    p_by_owner_id: input.ownerUserId,
    p_notes: input.notes ?? null,
  });
  if (rpc.error) throw rpc.error;
  return rpc.data;
}
