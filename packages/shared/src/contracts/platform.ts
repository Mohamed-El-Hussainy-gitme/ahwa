export type PlatformSubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
export type PlatformCafeOwnerLabel = 'owner' | 'partner';
export type PlatformBindingStatus = 'bound' | 'unbound' | 'invalid';

export type PlatformCafeDatabaseBinding = {
  database_key: string;
  binding_source: string;
};

export type PlatformCafeOwnerRow = {
  id: string;
  full_name: string;
  phone: string;
  owner_label: PlatformCafeOwnerLabel;
  is_active: boolean;
  created_at?: string;
};

export type PlatformCafeSubscriptionRow = {
  id: string;
  starts_at?: string;
  ends_at: string;
  grace_days?: number;
  status?: PlatformSubscriptionStatus;
  effective_status: PlatformSubscriptionStatus;
  amount_paid: number;
  is_complimentary: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  countdown_seconds: number;
};

export type PlatformCafeListRow = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  last_activity_at?: string | null;
  owner_count?: number;
  active_owner_count?: number;
  owners?: PlatformCafeOwnerRow[];
  current_subscription?: PlatformCafeSubscriptionRow | null;
  database_key?: string | null;
  database_binding?: PlatformCafeDatabaseBinding | null;
  binding_status?: PlatformBindingStatus;
};

export type PlatformOperationalDatabaseOption = {
  database_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  is_accepting_new_cafes: boolean;
  cafe_count: number;
};
