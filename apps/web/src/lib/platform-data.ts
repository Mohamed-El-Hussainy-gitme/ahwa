import type {
  PlatformBindingStatus,
  PlatformCafeDatabaseBinding,
  PlatformCafeListRow,
  PlatformCafeLoadTier,
  PlatformCafeOwnerLabel,
  PlatformCafeOwnerRow,
  PlatformCafeSubscriptionRow,
  PlatformDatabaseCapacityState,
  PlatformOperationalDatabaseOption,
  PlatformSubscriptionStatus,
} from '@ahwa/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asTrimmedString(value: unknown): string | null {
  const normalized = asString(value)?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function asOwnerLabel(value: unknown): PlatformCafeOwnerLabel | null {
  return value === 'owner' || value === 'partner' || value === 'branch_manager' ? value : null;
}

function asSubscriptionStatus(value: unknown): PlatformSubscriptionStatus | null {
  return value === 'trial' || value === 'active' || value === 'expired' || value === 'suspended'
    ? value
    : null;
}


function asCafeLoadTier(value: unknown): PlatformCafeLoadTier | null {
  return value === 'small' || value === 'medium' || value === 'heavy' || value === 'enterprise'
    ? value
    : null;
}

function asCapacityState(value: unknown): PlatformDatabaseCapacityState | null {
  return value === 'healthy' || value === 'warning' || value === 'critical' || value === 'hot' || value === 'full' || value === 'draining' || value === 'inactive'
    ? value
    : null;
}
function asBindingStatus(value: unknown): PlatformBindingStatus | null {
  return value === 'bound' || value === 'unbound' || value === 'invalid' ? value : null;
}

function normalizeCafeOwnerRow(value: unknown): PlatformCafeOwnerRow | null {
  if (!isRecord(value)) return null;

  const id = asTrimmedString(value.id);
  const fullName = asTrimmedString(value.full_name);
  const phone = asTrimmedString(value.phone);
  const ownerLabel = asOwnerLabel(value.owner_label);
  const isActive = asBoolean(value.is_active);

  if (!id || !fullName || !phone || !ownerLabel || isActive === null) {
    return null;
  }

  return {
    id,
    full_name: fullName,
    phone,
    owner_label: ownerLabel,
    is_active: isActive,
    created_at: asString(value.created_at) ?? undefined,
  };
}

function normalizeCafeSubscriptionRow(value: unknown): PlatformCafeSubscriptionRow | null {
  if (!isRecord(value)) return null;

  const id = asTrimmedString(value.id);
  const endsAt = asTrimmedString(value.ends_at);
  const effectiveStatus = asSubscriptionStatus(value.effective_status);

  if (!id || !endsAt || !effectiveStatus) {
    return null;
  }

  return {
    id,
    starts_at: asString(value.starts_at) ?? undefined,
    ends_at: endsAt,
    grace_days: asNumber(value.grace_days) ?? undefined,
    status: asSubscriptionStatus(value.status) ?? undefined,
    effective_status: effectiveStatus,
    amount_paid: asNumber(value.amount_paid) ?? 0,
    is_complimentary: asBoolean(value.is_complimentary) ?? false,
    notes: asString(value.notes),
    created_at: asString(value.created_at) ?? undefined,
    updated_at: asString(value.updated_at) ?? undefined,
    countdown_seconds: asNumber(value.countdown_seconds) ?? 0,
  };
}

function normalizeDatabaseBinding(value: unknown): PlatformCafeDatabaseBinding | null {
  if (!isRecord(value)) return null;

  const databaseKey = asTrimmedString(value.database_key);
  if (!databaseKey) return null;

  return {
    database_key: databaseKey,
    binding_source: asTrimmedString(value.binding_source) ?? 'unknown',
    cafe_load_tier: asCafeLoadTier(value.cafe_load_tier) ?? undefined,
    load_units: asNumber(value.load_units) ?? undefined,
  };
}

export function normalizeCafeListRow(value: unknown): PlatformCafeListRow | null {
  if (!isRecord(value)) return null;

  const id = asTrimmedString(value.id);
  const slug = asTrimmedString(value.slug);
  const displayName = asTrimmedString(value.display_name);
  const createdAt = asTrimmedString(value.created_at);
  const isActive = asBoolean(value.is_active);

  if (!id || !slug || !displayName || !createdAt || isActive === null) {
    return null;
  }

  const databaseBinding = normalizeDatabaseBinding(value.database_binding);
  const databaseKey = asTrimmedString(value.database_key) ?? databaseBinding?.database_key ?? null;

  const owners = Array.isArray(value.owners)
    ? value.owners.map(normalizeCafeOwnerRow).filter((row): row is PlatformCafeOwnerRow => row !== null)
    : [];

  const bindingStatus = asBindingStatus(value.binding_status) ?? (databaseKey ? 'bound' : 'unbound');

  return {
    id,
    slug,
    display_name: displayName,
    is_active: isActive,
    created_at: createdAt,
    last_activity_at: asString(value.last_activity_at),
    operational_last_activity_at: asString(value.operational_last_activity_at),
    last_online_at: asString(value.last_online_at),
    last_app_opened_at: asString(value.last_app_opened_at),
    online_users_count: asNumber(value.online_users_count) ?? 0,
    visible_runtime_count: asNumber(value.visible_runtime_count) ?? 0,
    online_now: asBoolean(value.online_now) ?? false,
    open_sessions_count: asNumber(value.open_sessions_count) ?? 0,
    active_staff_count: asNumber(value.active_staff_count) ?? 0,
    last_open_order_at: asString(value.last_open_order_at),
    last_open_order_id: asString(value.last_open_order_id),
    last_open_order_session_id: asString(value.last_open_order_session_id),
    last_open_order_session_label: asString(value.last_open_order_session_label),
    last_open_order_status: asString(value.last_open_order_status),
    last_open_order_items_count: asNumber(value.last_open_order_items_count) ?? 0,
    owner_count: asNumber(value.owner_count) ?? owners.length,
    active_owner_count:
      asNumber(value.active_owner_count) ?? owners.filter((owner) => owner.is_active).length,
    owners,
    current_subscription:
      value.current_subscription === null
        ? null
        : normalizeCafeSubscriptionRow(value.current_subscription),
    database_key: databaseKey,
    database_binding: databaseBinding,
    binding_status: bindingStatus,
  };
}

export function extractCafeListItems(payload: unknown): PlatformCafeListRow[] {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
    return [];
  }

  return payload.items
    .map(normalizeCafeListRow)
    .filter((row): row is PlatformCafeListRow => row !== null);
}

function normalizeOperationalDatabaseOption(value: unknown): PlatformOperationalDatabaseOption | null {
  if (!isRecord(value)) return null;

  const databaseKey = asTrimmedString(value.database_key);
  const displayName = asTrimmedString(value.display_name);
  const isActive = asBoolean(value.is_active);
  const isAccepting = asBoolean(value.is_accepting_new_cafes);

  if (!databaseKey || !displayName || isActive === null || isAccepting === null) {
    return null;
  }

  return {
    database_key: databaseKey,
    display_name: displayName,
    description: asString(value.description),
    is_active: isActive,
    is_accepting_new_cafes: isAccepting,
    cafe_count: asNumber(value.cafe_count) ?? 0,
    total_load_units: asNumber(value.total_load_units) ?? undefined,
    max_load_units: asNumber(value.max_load_units) ?? undefined,
    warning_load_percent: asNumber(value.warning_load_percent) ?? undefined,
    critical_load_percent: asNumber(value.critical_load_percent) ?? undefined,
    load_percent: asNumber(value.load_percent) ?? undefined,
    small_cafe_count: asNumber(value.small_cafe_count) ?? undefined,
    medium_cafe_count: asNumber(value.medium_cafe_count) ?? undefined,
    heavy_cafe_count: asNumber(value.heavy_cafe_count) ?? undefined,
    enterprise_cafe_count: asNumber(value.enterprise_cafe_count) ?? undefined,
    max_cafes: asNumber(value.max_cafes),
    max_heavy_cafes: asNumber(value.max_heavy_cafes),
    capacity_state: asCapacityState(value.capacity_state) ?? undefined,
    scale_notes: asString(value.scale_notes),
  };
}

export function extractOperationalDatabaseOptions(payload: unknown): PlatformOperationalDatabaseOption[] {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
    return [];
  }

  return payload.items
    .map(normalizeOperationalDatabaseOption)
    .filter((row): row is PlatformOperationalDatabaseOption => row !== null);
}

export function extractCreatedCafeId(payload: unknown): string {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
    return '';
  }

  return asTrimmedString(payload.data.cafe_id) ?? '';
}
