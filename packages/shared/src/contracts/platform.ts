export type PlatformSubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
export type PlatformCafeOwnerLabel = 'owner' | 'partner' | 'branch_manager';
export type PlatformBindingStatus = 'bound' | 'unbound' | 'invalid';
export type PlatformCafeLoadTier = 'small' | 'medium' | 'heavy' | 'enterprise';
export type PlatformDatabaseCapacityState = 'healthy' | 'warning' | 'critical' | 'hot' | 'full' | 'draining' | 'inactive';

export type PlatformCafeDatabaseBinding = {
  database_key: string;
  binding_source: string;
  cafe_load_tier?: PlatformCafeLoadTier;
  load_units?: number;
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
  operational_last_activity_at?: string | null;
  last_online_at?: string | null;
  last_app_opened_at?: string | null;
  online_users_count?: number;
  visible_runtime_count?: number;
  online_now?: boolean;
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
  total_load_units?: number;
  max_load_units?: number;
  warning_load_percent?: number;
  critical_load_percent?: number;
  load_percent?: number;
  small_cafe_count?: number;
  medium_cafe_count?: number;
  heavy_cafe_count?: number;
  enterprise_cafe_count?: number;
  max_cafes?: number | null;
  max_heavy_cafes?: number | null;
  capacity_state?: PlatformDatabaseCapacityState;
  scale_notes?: string | null;
};


export type PlatformObservabilitySeverity = 'healthy' | 'warning' | 'critical';

export type PlatformOperationalRuntimeSnapshot = {
  open_shift_count: number;
  active_cafe_count: number;
  open_session_count: number;
  pending_item_count: number;
  ready_item_count: number;
  waiting_qty: number;
  ready_qty: number;
  billable_qty: number;
  oldest_pending_seconds: number | null;
  oldest_ready_seconds: number | null;
  deferred_customer_count: number;
  deferred_outstanding_amount: number;
  last_deferred_entry_at: string | null;
};

export type PlatformOperationalOutboxSnapshot = {
  pending_count: number;
  inflight_count: number;
  retrying_count: number;
  dead_letter_count: number;
  max_publish_attempts: number;
  oldest_pending_seconds: number | null;
  last_published_at: string | null;
};

export type PlatformOperationalDispatchSnapshot = {
  last_run_at: string | null;
  last_hour_runs: number;
  last_hour_claimed: number;
  last_hour_published: number;
  last_hour_failed: number;
  last_hour_dead_lettered: number;
  last_hour_avg_duration_ms: number;
};

export type PlatformOperationalAlert = {
  code: string;
  severity: PlatformObservabilitySeverity;
  message: string;
};

export type PlatformOperationalObservabilityRow = {
  database_key: string;
  display_name: string;
  description: string | null;
  configured_in_env: boolean;
  is_active: boolean;
  is_accepting_new_cafes: boolean;
  cafe_count: number;
  total_load_units: number;
  max_load_units: number;
  load_percent: number;
  heavy_cafe_count: number;
  max_cafes: number | null;
  max_heavy_cafes: number | null;
  capacity_state: PlatformDatabaseCapacityState;
  scale_notes: string | null;
  status: PlatformObservabilitySeverity;
  generated_at: string | null;
  database_name: string | null;
  runtime: PlatformOperationalRuntimeSnapshot;
  outbox: PlatformOperationalOutboxSnapshot;
  dispatch: PlatformOperationalDispatchSnapshot;
  alerts: PlatformOperationalAlert[];
  error: string | null;
};

export type PlatformOperationalObservabilitySummary = {
  generated_at: string;
  shard_count: number;
  healthy_shard_count: number;
  warning_shard_count: number;
  critical_shard_count: number;
  total_cafes: number;
  total_load_units: number;
  total_max_load_units: number;
  total_active_cafes: number;
  total_open_shifts: number;
  total_open_sessions: number;
  total_waiting_qty: number;
  total_ready_qty: number;
  total_billable_qty: number;
  total_outbox_pending: number;
  total_outbox_inflight: number;
  total_dead_letters: number;
  total_dispatch_published_last_hour: number;
  total_dispatch_failed_last_hour: number;
};
