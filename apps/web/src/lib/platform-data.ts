import type {
  PlatformBindingStatus,
  PlatformCafeDatabaseBinding,
  PlatformCafeListRow,
  PlatformCafeOwnerLabel,
  PlatformCafeOwnerRow,
  PlatformCafeSubscriptionRow,
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
  return value === 'owner' || value === 'partner' ? value : null;
}

function asSubscriptionStatus(value: unknown): PlatformSubscriptionStatus | null {
  return value === 'trial' || value === 'active' || value === 'expired' || value === 'suspended'
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
