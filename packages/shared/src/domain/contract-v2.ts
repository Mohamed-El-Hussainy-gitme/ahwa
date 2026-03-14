export type AccountKind = 'owner' | 'employee';

export type ShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha';

export type DeviceStatus = 'pending' | 'active' | 'revoked' | 'blocked';
export type DeviceMode = 'shared_runtime' | 'station_only' | 'owner_private';
export type StationType = 'barista' | 'shisha' | 'kitchen' | 'service';
export type DeliveryMode = 'waiter' | 'self_delivery';

export type ShiftStatus = 'draft' | 'open' | 'closing' | 'closed' | 'cancelled';
export type ShiftKind = 'morning' | 'evening' | 'custom';

export type PaymentMethod = 'cash' | 'card' | 'wallet' | 'bank_transfer' | 'deferred';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';
export type DeferredEntryDirection = 'debit' | 'credit';

export type CanonicalUser = {
  id: string;
  tenantId: string;
  accountKind: AccountKind;
  fullName: string;
  phone?: string;
  isActive: boolean;
};

export type CanonicalShiftAssignment = {
  userId: string;
  shiftRole: ShiftRole;
  isPrimary?: boolean;
  isActive: boolean;
};
