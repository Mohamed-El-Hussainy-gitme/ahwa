'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';
import { extractCafeListItems, extractOperationalDatabaseOptions } from '@/lib/platform-data';
import PlatformPortfolioOverview from './PlatformPortfolioOverview';

type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
type ViewKey = 'overview' | 'cafes' | 'money' | 'support';

type CafeSubscriptionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  grace_days: number;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  amount_paid: number;
  is_complimentary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  countdown_seconds: number;
};

type CafeOwnerRow = {
  id: string;
  full_name: string;
  phone: string;
  owner_label: 'owner' | 'partner' | 'branch_manager';
  is_active: boolean;
  created_at: string;
};

type CafeRow = {
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
  owners?: CafeOwnerRow[];
  current_subscription?: CafeSubscriptionRow | null;
};

type MoneyFollowSummary = {
  subscriptions_total: number;
  paid_entries: number;
  complimentary_entries: number;
  collected_total: number;
  overdue_count: number;
  due_soon_count: number;
  suspended_count: number;
};

type MoneyFollowWatchRow = {
  cafe_id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  payment_state: 'paid_current' | 'trial_or_free' | 'overdue' | 'suspended';
  effective_status: SubscriptionStatus | null;
  ends_at: string | null;
  countdown_seconds: number | null;
  amount_paid: number | null;
  is_complimentary: boolean | null;
  last_activity_at: string | null;
  has_open_shift: boolean;
  notes: string | null;
};

type MoneyFollowEntryRow = {
  subscription_id: string;
  cafe_id: string;
  slug: string;
  display_name: string;
  starts_at: string;
  ends_at: string;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  amount_paid: number;
  is_complimentary: boolean;
  notes: string | null;
  created_at: string;
};

type MoneyFollowResponseData = {
  generated_at: string;
  summary: MoneyFollowSummary;
  watchlist: MoneyFollowWatchRow[];
  recent_entries: MoneyFollowEntryRow[];
};

type CafeListResponse = { ok: true; items: CafeRow[] };
type CreateCafeResponse = { ok: true; data?: { cafe_id?: string; password_setup_code?: string | null; password_setup_expires_at?: string | null } };
type MoneyFollowApiResponse = { ok: true; data: MoneyFollowResponseData | null };

type SupportMessageStatus = 'new' | 'in_progress' | 'closed';
type SupportMessagePriority = 'low' | 'normal' | 'high';
type SupportAccessStatus = 'not_requested' | 'requested' | 'granted' | 'revoked' | 'expired';

type SupportReplyRow = {
  id: string;
  support_message_id: string;
  author_super_admin_user_id: string;
  reply_note: string;
  created_at: string;
};

type SupportMessageRow = {
  id: string;
  cafe_id: string | null;
  cafe_slug_snapshot: string | null;
  cafe_display_name_snapshot: string | null;
  sender_name: string;
  sender_phone: string;
  actor_kind: string | null;
  source: 'login' | 'in_app';
  page_path: string | null;
  issue_type: string;
  message: string;
  status: SupportMessageStatus;
  priority: SupportMessagePriority;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  support_access_requested: boolean;
  support_access_status: SupportAccessStatus;
  support_access_requested_at: string | null;
  support_access_granted_at: string | null;
  support_access_expires_at: string | null;
  support_access_revoked_at: string | null;
  support_access_note: string | null;
  replies: SupportReplyRow[];
};

type SupportInboxData = {
  summary: {
    total: number;
    new_count: number;
    in_progress_count: number;
    closed_count: number;
    high_priority_count: number;
    requested_access_count: number;
    active_access_count: number;
  };
  items: SupportMessageRow[];
};

type SupportInboxResponse = { ok: true; data: SupportInboxData | null };

type CreateCafeFormState = {
  cafeSlug: string;
  cafeDisplayName: string;
  ownerFullName: string;
  ownerPhone: string;
  startsAt: string;
  endsAt: string;
  graceDays: string;
  status: SubscriptionStatus;
  amountPaid: string;
  isComplimentary: boolean;
  notes: string;
  databaseKey: string;
};

type PasswordSetupInvite = {
  cafeSlug: string;
  ownerPhone: string;
  code: string;
  expiresAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === 'trial' || value === 'active' || value === 'expired' || value === 'suspended';
}

function isCafeSubscriptionRow(value: unknown): value is CafeSubscriptionRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.starts_at === 'string' &&
    typeof value.ends_at === 'string' &&
    typeof value.grace_days === 'number' &&
    isSubscriptionStatus(value.status) &&
    isSubscriptionStatus(value.effective_status) &&
    typeof value.amount_paid === 'number' &&
    typeof value.is_complimentary === 'boolean' &&
    (typeof value.notes === 'string' || value.notes === null) &&
    typeof value.created_at === 'string' &&
    (typeof value.last_activity_at === 'undefined' || typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    typeof value.updated_at === 'string' &&
    typeof value.countdown_seconds === 'number'
  );
}

function createPlatformError(payload: unknown, fallback: string) {
  return new Error(extractPlatformApiErrorMessage(payload, fallback));
}

function isMoneyFollowResponse(value: unknown): value is MoneyFollowApiResponse {
  return isRecord(value) && value.ok === true && (value.data === null || isRecord(value.data));
}

function isSupportInboxResponse(value: unknown): value is SupportInboxResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.data === null || (
      isRecord(value.data) &&
      isRecord(value.data.summary) &&
      typeof value.data.summary.total === 'number' &&
      typeof value.data.summary.new_count === 'number' &&
      typeof value.data.summary.in_progress_count === 'number' &&
      typeof value.data.summary.closed_count === 'number' &&
      typeof value.data.summary.high_priority_count === 'number' &&
      typeof value.data.summary.requested_access_count === 'number' &&
      typeof value.data.summary.active_access_count === 'number' &&
      Array.isArray(value.data.items) &&
      value.data.items.every(isSupportMessageRow)
    ))
  );
}


function isCafeOwnerRow(value: unknown): value is CafeOwnerRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.full_name === 'string' &&
    typeof value.phone === 'string' &&
    (value.owner_label === 'owner' || value.owner_label === 'partner' || value.owner_label === 'branch_manager') &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string'
  );
}

function isCafeRow(value: unknown): value is CafeRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string' &&
    (typeof value.last_activity_at === 'undefined' || typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    (typeof value.operational_last_activity_at === 'undefined' || typeof value.operational_last_activity_at === 'string' || value.operational_last_activity_at === null) &&
    (typeof value.last_online_at === 'undefined' || typeof value.last_online_at === 'string' || value.last_online_at === null) &&
    (typeof value.last_app_opened_at === 'undefined' || typeof value.last_app_opened_at === 'string' || value.last_app_opened_at === null) &&
    (typeof value.online_users_count === 'undefined' || typeof value.online_users_count === 'number') &&
    (typeof value.visible_runtime_count === 'undefined' || typeof value.visible_runtime_count === 'number') &&
    (typeof value.online_now === 'undefined' || typeof value.online_now === 'boolean') &&
    (typeof value.owner_count === 'undefined' || typeof value.owner_count === 'number') &&
    (typeof value.active_owner_count === 'undefined' || typeof value.active_owner_count === 'number') &&
    (typeof value.owners === 'undefined' || (Array.isArray(value.owners) && value.owners.every(isCafeOwnerRow))) &&
    (typeof value.current_subscription === 'undefined' || value.current_subscription === null || isCafeSubscriptionRow(value.current_subscription))
  );
}

function isCreateCafeResponse(value: unknown): value is CreateCafeResponse {
  if (!isRecord(value) || value.ok !== true) return false;
  if (typeof value.data === 'undefined') return true;
  return isRecord(value.data) &&
    (typeof value.data.cafe_id === 'undefined' || typeof value.data.cafe_id === 'string') &&
    (typeof value.data.password_setup_code === 'undefined' || typeof value.data.password_setup_code === 'string' || value.data.password_setup_code === null) &&
    (typeof value.data.password_setup_expires_at === 'undefined' || typeof value.data.password_setup_expires_at === 'string' || value.data.password_setup_expires_at === null);
}

function isSupportReplyRow(value: unknown): value is SupportReplyRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.support_message_id === 'string' &&
    typeof value.author_super_admin_user_id === 'string' &&
    typeof value.reply_note === 'string' &&
    typeof value.created_at === 'string'
  );
}

function isSupportMessageRow(value: unknown): value is SupportMessageRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (typeof value.cafe_id === 'string' || value.cafe_id === null) &&
    (typeof value.cafe_slug_snapshot === 'string' || value.cafe_slug_snapshot === null) &&
    (typeof value.cafe_display_name_snapshot === 'string' || value.cafe_display_name_snapshot === null) &&
    typeof value.sender_name === 'string' &&
    typeof value.sender_phone === 'string' &&
    (typeof value.actor_kind === 'string' || value.actor_kind === null) &&
    (value.source === 'login' || value.source === 'in_app') &&
    (typeof value.page_path === 'string' || value.page_path === null) &&
    typeof value.issue_type === 'string' &&
    typeof value.message === 'string' &&
    (value.status === 'new' || value.status === 'in_progress' || value.status === 'closed') &&
    (value.priority === 'low' || value.priority === 'normal' || value.priority === 'high') &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    (typeof value.closed_at === 'string' || value.closed_at === null) &&
    typeof value.support_access_requested === 'boolean' &&
    (value.support_access_status === 'not_requested' || value.support_access_status === 'requested' || value.support_access_status === 'granted' || value.support_access_status === 'revoked' || value.support_access_status === 'expired') &&
    (typeof value.support_access_requested_at === 'string' || value.support_access_requested_at === null) &&
    (typeof value.support_access_granted_at === 'string' || value.support_access_granted_at === null) &&
    (typeof value.support_access_expires_at === 'string' || value.support_access_expires_at === null) &&
    (typeof value.support_access_revoked_at === 'string' || value.support_access_revoked_at === null) &&
    (typeof value.support_access_note === 'string' || value.support_access_note === null) &&
    Array.isArray(value.replies) &&
    value.replies.every(isSupportReplyRow)
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function subscriptionBadgeClass(status: SubscriptionStatus) {
  switch (status) {
    case 'trial':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
  }
}

function cafeStatusBadgeClass(active: boolean) {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
}

function paymentStateText(subscription: CafeSubscriptionRow | null | undefined) {
  if (!subscription) return 'بدون اشتراك';
  if (subscription.effective_status === 'suspended') return 'معلق';
  if (subscription.effective_status === 'expired') return 'منتهي';
  if (subscription.effective_status === 'trial') return subscription.is_complimentary ? 'مجاني / تجريبي' : 'تجريبي';
  return subscription.is_complimentary ? 'مجاني' : 'مدفوع';
}

function ownerLabelText(label: 'owner' | 'partner' | 'branch_manager') {
  return label === 'owner' ? 'مالك' : label === 'branch_manager' ? 'مدير فرع' : 'شريك';
}

function applyPreset(days: number, complimentary: boolean, status: SubscriptionStatus): Pick<CreateCafeFormState, 'startsAt' | 'endsAt' | 'graceDays' | 'status' | 'amountPaid' | 'isComplimentary'> {
  const start = new Date();
  const end = new Date(start.getTime() + 1000 * 60 * 60 * 24 * days);
  return {
    startsAt: toDateInputValue(start),
    endsAt: toDateInputValue(end),
    graceDays: '0',
    status,
    amountPaid: complimentary ? '0' : '',
    isComplimentary: complimentary,
  };
}

function supportStatusLabel(status: SupportMessageStatus) {
  switch (status) {
    case 'new':
      return 'جديد';
    case 'in_progress':
      return 'قيد المتابعة';
    default:
      return 'مغلق';
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function amountLabel(value: number | null | undefined) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

function countdownLabel(totalSeconds: number | null | undefined) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(Number(totalSeconds))) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  if (days > 0) return `${days} يوم و ${hours} ساعة`;
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ساعة و ${minutes} دقيقة`;
}

function latestPresenceAt(cafe: Pick<CafeRow, 'last_online_at' | 'last_app_opened_at' | 'last_activity_at' | 'created_at'>) {
  return cafe.last_online_at ?? cafe.last_app_opened_at ?? cafe.last_activity_at ?? cafe.created_at;
}

function operationalActivityAt(cafe: Pick<CafeRow, 'operational_last_activity_at' | 'last_activity_at' | 'created_at'>) {
  return cafe.operational_last_activity_at ?? cafe.last_activity_at ?? cafe.created_at;
}

function presenceLabel(cafe: Pick<CafeRow, 'online_now' | 'online_users_count'>) {
  return cafe.online_now ? 'أونلاين الآن' : (cafe.online_users_count ?? 0) > 0 ? 'أونلاين' : 'غير متصل';
}

function presenceBadgeClass(cafe: Pick<CafeRow, 'online_now' | 'online_users_count'>) {
  return cafe.online_now
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : (cafe.online_users_count ?? 0) > 0
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : 'border-slate-200 bg-slate-50 text-slate-600';
}

function supportStatusClass(status: SupportMessageStatus) {
  switch (status) {
    case 'new': return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'in_progress': return 'border-amber-200 bg-amber-50 text-amber-700';
    default: return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

function priorityClass(priority: SupportMessagePriority) {
  switch (priority) {
    case 'high': return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'low': return 'border-slate-200 bg-slate-50 text-slate-700';
    default: return 'border-violet-200 bg-violet-50 text-violet-700';
  }
}

function priorityLabel(priority: SupportMessagePriority) {
  switch (priority) {
    case 'high': return 'عالية';
    case 'low': return 'منخفضة';
    default: return 'عادية';
  }
}

function supportAccessStatusClass(status: SupportAccessStatus) {
  switch (status) {
    case 'requested':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'granted':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'revoked':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function supportAccessStatusLabel(status: SupportAccessStatus) {
  switch (status) {
    case 'requested':
      return 'طلب وصول';
    case 'granted':
      return 'وصول مفعل';
    case 'expired':
      return 'وصول منتهي';
    case 'revoked':
      return 'وصول مسحوب';
    default:
      return 'بدون وصول';
  }
}

export function SupportSection({ refreshKey, selectedCafeId }: { refreshKey: number; selectedCafeId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SupportInboxData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | SupportMessageStatus | 'requested_access' | 'active_access'>('all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [accessDurationHoursById, setAccessDurationHoursById] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      if (selectedCafeId) params.set('cafeId', selectedCafeId);
      const res = await fetch(`/api/platform/support/messages?${params.toString()}`, { cache: 'no-store' });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_SUPPORT_FAILED');
      const nextData = isSupportInboxResponse(json) ? json.data : null;
      setData(nextData);
      setAccessDurationHoursById((current) => {
        const next = { ...current };
        for (const item of nextData?.items ?? []) {
          if (!next[item.id]) {
            next[item.id] = 4;
          }
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_SUPPORT_FAILED');
    } finally {
      setLoading(false);
    }
  }, [selectedCafeId, statusFilter]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function updateStatus(messageId: string, status: SupportMessageStatus) {
    setBusyId(messageId);
    try {
      const res = await fetch('/api/platform/support/messages/update-status', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messageId, status }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'UPDATE_SUPPORT_STATUS_FAILED');
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'UPDATE_SUPPORT_STATUS_FAILED');
    } finally {
      setBusyId(null);
    }
  }

  async function sendReply(messageId: string) {
    const replyNote = (replyDrafts[messageId] ?? '').trim();
    if (!replyNote) return;
    setBusyId(messageId);
    try {
      const res = await fetch('/api/platform/support/messages/reply', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messageId, replyNote, setStatus: 'in_progress' }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'SEND_SUPPORT_REPLY_FAILED');
      setReplyDrafts((value) => ({ ...value, [messageId]: '' }));
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SEND_SUPPORT_REPLY_FAILED');
    } finally {
      setBusyId(null);
    }
  }

  async function grantSupportAccess(messageId: string) {
    setBusyId(messageId);
    try {
      const durationHours = Math.max(1, Math.min(Math.trunc(accessDurationHoursById[messageId] ?? 4), 72));
      const res = await fetch('/api/platform/support/access/grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId, durationHours }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'GRANT_SUPPORT_ACCESS_FAILED');
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'GRANT_SUPPORT_ACCESS_FAILED');
    } finally {
      setBusyId(null);
    }
  }

  async function revokeSupportAccess(messageId: string) {
    setBusyId(messageId);
    try {
      const res = await fetch('/api/platform/support/access/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'REVOKE_SUPPORT_ACCESS_FAILED');
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REVOKE_SUPPORT_ACCESS_FAILED');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="رسائل الدعم" value={String(data?.summary.total ?? 0)} />
        <MetricCard title="جديدة" value={String(data?.summary.new_count ?? 0)} tone="sky" />
        <MetricCard title="قيد المتابعة" value={String(data?.summary.in_progress_count ?? 0)} tone="warn" />
        <MetricCard title="طلبات وصول" value={String(data?.summary.requested_access_count ?? 0)} tone="sky" />
        <MetricCard title="وصول مفعل" value={String(data?.summary.active_access_count ?? 0)} tone="ok" />
        <MetricCard title="أولوية عالية" value={String(data?.summary.high_priority_count ?? 0)} tone="warn" />
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">صندوق الدعم الفني</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'new', 'in_progress', 'requested_access', 'active_access', 'closed'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setStatusFilter(item)} className={`rounded-2xl px-4 py-2 text-sm font-medium ${statusFilter === item ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
                {item === 'all' ? 'الكل' : item === 'requested_access' ? 'طلبات الوصول' : item === 'active_access' ? 'الوصولات المفعلة' : supportStatusLabel(item)}
              </button>
            ))}
            <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">تحديث</button>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
            إذا طلبت القهوة وصول دعم مؤقت، يمكنك من هنا تفعيل الوصول ثم الدخول إلى نفس القهوة مؤقتًا بصلاحيات المالك حتى انتهاء الوقت أو إغلاق البلاغ.
          </div>
          {!data && loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">جارٍ تحميل رسائل الدعم...</div> : null}
          {data?.items.map((item) => {
            const durationHours = Math.max(1, Math.min(Math.trunc(accessDurationHoursById[item.id] ?? 4), 72));
            const accessRequested = item.support_access_requested || item.support_access_status !== 'not_requested';
            const accessGranted = item.support_access_status === 'granted';
            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-slate-900">{item.cafe_display_name_snapshot || item.cafe_slug_snapshot || 'بدون قهوة محددة'}</div>
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${supportStatusClass(item.status)}`}>{supportStatusLabel(item.status)}</span>
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{priorityLabel(item.priority)}</span>
                      {accessRequested ? (
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${supportAccessStatusClass(item.support_access_status)}`}>{supportAccessStatusLabel(item.support_access_status)}</span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{item.sender_name}</span>
                      <span>{item.sender_phone}</span>
                      <span>{item.issue_type}</span>
                      <span>{formatDateTime(item.created_at)}</span>
                      {item.page_path ? <span>{item.page_path}</span> : null}
                    </div>
                    <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{item.message}</div>
                    {accessRequested ? (
                      <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                        <div className="font-semibold">وصول الدعم المؤقت</div>
                        <div className="mt-1 text-xs text-indigo-800">
                          {item.support_access_requested_at ? `طُلِب عند ${formatDateTime(item.support_access_requested_at)}.` : 'تم طلب الوصول من داخل القهوة.'}
                          {item.support_access_granted_at ? ` فُعّل عند ${formatDateTime(item.support_access_granted_at)}.` : ''}
                          {item.support_access_expires_at ? ` ينتهي عند ${formatDateTime(item.support_access_expires_at)}.` : ''}
                        </div>
                        {item.support_access_note ? <div className="mt-2 rounded-2xl bg-white/70 p-3 text-xs text-indigo-900">{item.support_access_note}</div> : null}
                      </div>
                    ) : null}
                    {item.replies.length ? (
                      <div className="mt-3 space-y-2">
                        {item.replies.map((reply) => (
                          <div key={reply.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                            <div className="text-xs text-slate-500">رد داخلي — {formatDateTime(reply.created_at)}</div>
                            <div className="mt-1">{reply.reply_note}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="w-full max-w-sm space-y-2 lg:w-80">
                    <div className="grid grid-cols-3 gap-2">
                      <button disabled={busyId === item.id} type="button" onClick={() => void updateStatus(item.id, 'new')} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">جديد</button>
                      <button disabled={busyId === item.id} type="button" onClick={() => void updateStatus(item.id, 'in_progress')} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">متابعة</button>
                      <button disabled={busyId === item.id} type="button" onClick={() => void updateStatus(item.id, 'closed')} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">إغلاق</button>
                    </div>

                    {accessRequested ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 text-xs font-semibold text-slate-700">التحكم في الوصول المؤقت</div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={72}
                            value={durationHours}
                            onChange={(event) => setAccessDurationHoursById((value) => ({ ...value, [item.id]: Number(event.target.value || 4) }))}
                            className="w-24 rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                          />
                          <span className="text-xs text-slate-500">ساعة</span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2">
                          <button
                            disabled={busyId === item.id || !item.cafe_id || !accessRequested}
                            type="button"
                            onClick={() => void grantSupportAccess(item.id)}
                            className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {busyId === item.id && !accessGranted ? 'جارٍ التفعيل...' : accessGranted ? 'تجديد الوصول المؤقت' : 'تفعيل وصول الدعم'}
                          </button>
                          <button
                            disabled={busyId === item.id || !accessGranted}
                            type="button"
                            onClick={() => void revokeSupportAccess(item.id)}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-60"
                          >
                            {busyId === item.id && accessGranted ? 'جارٍ السحب...' : 'سحب الوصول'}
                          </button>
                          {accessGranted ? (
                            <>
                              <Link href={`/api/platform/support/access/enter?messageId=${item.id}&next=/dashboard`} className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white">
                                الدخول إلى القهوة الآن
                              </Link>
                              <Link href={`/platform/support/access/${item.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700">
                                عرض ملخص القراءة السريعة
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm" placeholder="أضف ردًا أو ملاحظة متابعة داخلية" value={replyDrafts[item.id] ?? ''} onChange={(e) => setReplyDrafts((value) => ({ ...value, [item.id]: e.target.value }))} />
                    <button disabled={busyId === item.id} type="button" onClick={() => void sendReply(item.id)} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busyId === item.id ? 'جارٍ الحفظ...' : 'حفظ رد المتابعة'}</button>
                  </div>
                </div>
              </div>
            );
          })}
          {data && data.items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">لا توجد رسائل دعم مطابقة للفلترة الحالية.</div> : null}
        </div>
      </section>
    </div>
  );
}

export function MoneyFollowSection({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<MoneyFollowResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/money-follow', { cache: 'no-store' });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_MONEY_FOLLOW_FAILED');
      setData(isMoneyFollowResponse(json) ? json.data : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_MONEY_FOLLOW_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {!data && loading ? <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">جارٍ تحميل المتابعة المالية...</div> : null}
      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="إجمالي المقبوض" value={`${amountLabel(data.summary.collected_total)} ج.م`} />
            <MetricCard title="المنتهي أو المتأخر" value={String(data.summary.overdue_count)} tone="warn" />
            <MetricCard title="يقترب موعدها" value={String(data.summary.due_soon_count)} tone="sky" />
            <MetricCard title="اشتراكات مجانية" value={String(data.summary.complimentary_entries)} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">قائمة المتابعة</h2>
                  
                </div>
                <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">تحديث</button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">القهوة</th>
                      <th className="px-3 py-2 text-right font-medium">الحالة</th>
                      <th className="px-3 py-2 text-right font-medium">الاستحقاق</th>
                      <th className="px-3 py-2 text-right font-medium">القيمة</th>
                      <th className="px-3 py-2 text-right font-medium">آخر نشاط</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.watchlist.map((row) => (
                      <tr key={`${row.cafe_id}:${row.ends_at ?? 'none'}`} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900">{row.display_name}</div>
                          <div className="text-xs text-slate-500">{row.slug}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${row.effective_status ? subscriptionBadgeClass(row.effective_status) : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                            {row.effective_status ?? 'بدون اشتراك'}
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{row.has_open_shift ? 'وردية مفتوحة الآن' : 'بدون وردية مفتوحة'}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <div>{formatDateTime(row.ends_at)}</div>
                          <div className="mt-1 text-xs text-slate-500">{countdownLabel(row.countdown_seconds)}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <div>{row.is_complimentary ? 'مجاني' : `${amountLabel(row.amount_paid)} ج.م`}</div>
                          {row.notes ? <div className="mt-1 text-xs text-slate-500">{row.notes}</div> : null}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{formatDateTime(row.last_activity_at)}</td>
                      </tr>
                    ))}
                    {data.watchlist.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-500">لا توجد عناصر متابعة الآن.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">آخر الاشتراكات المسجلة</h2>
              <div className="mt-4 space-y-3">
                {data.recent_entries.slice(0, 12).map((entry) => (
                  <div key={entry.subscription_id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{entry.display_name}</div>
                        <div className="text-xs text-slate-500">{entry.slug}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${subscriptionBadgeClass(entry.effective_status)}`}>{entry.effective_status}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                      <span>من {formatDateTime(entry.starts_at)}</span>
                      <span>إلى {formatDateTime(entry.ends_at)}</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-700">{entry.is_complimentary ? 'اشتراك مجاني' : `تم تحصيل ${amountLabel(entry.amount_paid)} ج.م`}</div>
                    {entry.notes ? <div className="mt-2 text-xs text-slate-500">{entry.notes}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  helper,
  tone = 'default',
}: {
  title: string;
  value: string;
  helper?: string;
  tone?: 'default' | 'warn' | 'sky' | 'ok';
}) {
  const toneClass = tone === 'warn'
    ? 'border-amber-200 bg-amber-50'
    : tone === 'sky'
      ? 'border-sky-200 bg-sky-50'
      : tone === 'ok'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass}`}>
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}


const views: Array<{ key: ViewKey; label: string }> = [
  { key: 'overview', label: 'النظرة العامة' },
  { key: 'cafes', label: 'القهاوي' },
  { key: 'money', label: 'المتابعة المالية' },
  { key: 'support', label: 'الدعم الفني' },
];

function SidebarNavButton({
  active,
  label,
  helper,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  helper?: string;
  badge?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-2xl border px-4 py-3 text-right transition',
        active
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          {helper ? <div className={active ? 'mt-1 text-xs text-indigo-100' : 'mt-1 text-xs text-slate-500'}>{helper}</div> : null}
        </div>
        {badge ? (
          <span className={active ? 'rounded-full bg-white/20 px-2 py-1 text-xs font-semibold text-white' : 'rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600'}>
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function HeaderMiniStat({ title, value, helper }: { title: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{helper}</div>
    </div>
  );
}

export default function PlatformDashboardClient({ session }: { session: PlatformAdminSession }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<ViewKey>('overview');
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [supportNewCount, setSupportNewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [cafeStatusFilter, setCafeStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'free' | 'expired' | 'none'>('all');
  const [databaseOptions, setDatabaseOptions] = useState<Array<{ database_key: string; display_name: string; is_active: boolean; is_accepting_new_cafes: boolean }>>([]);
  const [createCafeInvite, setCreateCafeInvite] = useState<PasswordSetupInvite | null>(null);
  const [createCafe, setCreateCafe] = useState<CreateCafeFormState>({
    cafeSlug: '',
    cafeDisplayName: '',
    ownerFullName: '',
    ownerPhone: '',
    ...applyPreset(30, true, 'trial'),
    notes: '',
    databaseKey: '',
  });

  const loadCafes = useCallback(async (preferredCafeId?: string) => {
    const res = await fetch('/api/platform/cafes/list', { cache: 'no-store' });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_CAFES_FAILED');

    const items = extractCafeListItems(json) as CafeRow[];
    setCafes(items);

    const nextSelected =
      preferredCafeId && items.some((item) => item.id === preferredCafeId)
        ? preferredCafeId
        : selectedCafeId && items.some((item) => item.id === selectedCafeId)
          ? selectedCafeId
          : items[0]?.id ?? '';

    setSelectedCafeId(nextSelected);
    return nextSelected;
  }, [selectedCafeId]);

  useEffect(() => {
    void loadCafes().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_CAFES_FAILED');
    });
  }, [loadCafes]);

  useEffect(() => {
    let active = true;
    fetch('/api/platform/control-plane/operational-databases', { cache: 'no-store' })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok || !isPlatformApiOk(json)) return;
        const items = extractOperationalDatabaseOptions(json).filter((item) => item.is_active && item.is_accepting_new_cafes);
        if (!active) return;
        setDatabaseOptions(items);
        setCreateCafe((value) => ({
          ...value,
          databaseKey: value.databaseKey && items.some((item) => item.database_key === value.databaseKey)
            ? value.databaseKey
            : items[0]?.database_key ?? '',
        }));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/platform/support/messages?status=new&limit=20', { cache: 'no-store' })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok || !isPlatformApiOk(json)) return;
        if (active && isSupportInboxResponse(json) && json.data) setSupportNewCount(json.data.summary.new_count);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [refreshKey]);

  const selectedCafe = useMemo(() => cafes.find((item) => item.id === selectedCafeId) ?? null, [cafes, selectedCafeId]);

  const filteredCafes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cafes.filter((cafe) => {
      if (cafeStatusFilter === 'active' && !cafe.is_active) return false;
      if (cafeStatusFilter === 'inactive' && cafe.is_active) return false;
      const subscription = cafe.current_subscription ?? null;
      if (paymentFilter === 'paid' && (!subscription || subscription.is_complimentary || subscription.effective_status !== 'active')) return false;
      if (paymentFilter === 'free' && (!subscription || !subscription.is_complimentary)) return false;
      if (paymentFilter === 'expired' && (!subscription || subscription.effective_status !== 'expired')) return false;
      if (paymentFilter === 'none' && subscription) return false;
      if (!query) return true;
      return cafe.display_name.toLowerCase().includes(query) || cafe.slug.toLowerCase().includes(query);
    });
  }, [cafes, search, cafeStatusFilter, paymentFilter]);

  const expiringSoon = useMemo(() => cafes
    .filter((cafe) => {
      const subscription = cafe.current_subscription;
      return Boolean(subscription && subscription.effective_status !== 'expired' && subscription.countdown_seconds <= 86400 * 7);
    })
    .sort((a, b) => (a.current_subscription?.countdown_seconds ?? Number.MAX_SAFE_INTEGER) - (b.current_subscription?.countdown_seconds ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 8), [cafes]);

  const expiredCafes = useMemo(() => cafes.filter((cafe) => cafe.current_subscription?.effective_status === 'expired').slice(0, 8), [cafes]);
  const paidCurrentCount = useMemo(() => cafes.filter((cafe) => cafe.current_subscription?.effective_status === 'active' && !cafe.current_subscription?.is_complimentary).length, [cafes]);
  const cafesOnlineNowCount = useMemo(() => cafes.filter((cafe) => cafe.online_now || (cafe.online_users_count ?? 0) > 0).length, [cafes]);
  const onlineUsersTotal = useMemo(() => cafes.reduce((sum, cafe) => sum + (cafe.online_users_count ?? 0), 0), [cafes]);
  const visibleRuntimeTotal = useMemo(() => cafes.reduce((sum, cafe) => sum + (cafe.visible_runtime_count ?? 0), 0), [cafes]);

  async function submitCreateCafe() {
    setBusy(true);
    setError(null);
    setCreateCafeInvite(null);
    try {
      const res = await fetch('/api/platform/cafes/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafeSlug: createCafe.cafeSlug,
          cafeDisplayName: createCafe.cafeDisplayName,
          ownerFullName: createCafe.ownerFullName,
          ownerPhone: createCafe.ownerPhone,
          subscriptionStartsAt: fromDateInputValue(createCafe.startsAt),
          subscriptionEndsAt: fromDateInputValue(createCafe.endsAt),
          subscriptionGraceDays: Number(createCafe.graceDays || '0'),
          subscriptionStatus: createCafe.status,
          subscriptionAmountPaid: Number(createCafe.amountPaid || '0'),
          subscriptionIsComplimentary: createCafe.isComplimentary,
          subscriptionNotes: createCafe.notes.trim() || null,
          databaseKey: createCafe.databaseKey,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'CREATE_CAFE_FAILED');
      const createdCafeId = isCreateCafeResponse(json) && typeof json.data?.cafe_id === 'string' ? json.data.cafe_id : undefined;
      const setupCode = isCreateCafeResponse(json) ? json.data?.password_setup_code ?? null : null;
      const setupExpiresAt = isCreateCafeResponse(json) ? json.data?.password_setup_expires_at ?? null : null;
      if (setupCode) {
        setCreateCafeInvite({
          cafeSlug: createCafe.cafeSlug,
          ownerPhone: createCafe.ownerPhone,
          code: setupCode,
          expiresAt: setupExpiresAt ?? null,
        });
      }
      setCreateCafe({
        cafeSlug: '',
        cafeDisplayName: '',
        ownerFullName: '',
        ownerPhone: '',
        ...applyPreset(30, true, 'trial'),
        notes: '',
        databaseKey: databaseOptions[0]?.database_key ?? '',
      });
      await loadCafes(createdCafeId);
      setRefreshKey((value) => value + 1);
      setView('cafes');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'CREATE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitToggleCafe(cafeId: string, isActive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/cafes/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cafeId, isActive }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'TOGGLE_CAFE_FAILED');
      await loadCafes(cafeId);
      setRefreshKey((value) => value + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'TOGGLE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/platform/auth/logout', { method: 'POST' });
    router.replace('/platform/login');
    router.refresh();
  }

  return (
    <main className="min-h-dvh bg-slate-100 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-4 h-fit space-y-4 rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="rounded-[28px] bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 p-5 text-white">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">ahwa control</div>
              <div className="mt-3 text-2xl font-bold">لوحة السوبر أدمن</div>
              <div className="mt-2 text-sm text-indigo-50">{session.displayName}</div>
              <div className="mt-1 text-xs text-indigo-100">{session.email}</div>
            </div>

            <div className="space-y-2">
              {views.map((item) => (
                <SidebarNavButton
                  key={item.key}
                  active={view === item.key}
                  label={item.label}
                  badge={item.key === 'support' && supportNewCount > 0 ? String(supportNewCount) : null}
                  onClick={() => setView(item.key)}
                />
              ))}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">الواقع الحي</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">قهاوي أونلاين الآن</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{cafesOnlineNowCount}</div>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">مستخدمون أونلاين</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{onlineUsersTotal}</div>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">شاشات مرئية</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{visibleRuntimeTotal}</div>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">اشتراكات مدفوعة</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{paidCurrentCount}</div>
                </div>
              </div>
            </div>

            {selectedCafe ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">القهوة المحددة</div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${presenceBadgeClass(selectedCafe)}`}>{presenceLabel(selectedCafe)}</span>
                </div>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="font-semibold text-slate-900">{selectedCafe.display_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{selectedCafe.slug}</div>
                  <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] text-slate-500">الحضور الآن</div>
                      <div className="mt-1 font-semibold text-slate-900">{selectedCafe.online_users_count ?? 0} مستخدم • {selectedCafe.visible_runtime_count ?? 0} شاشة</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] text-slate-500">آخر ظهور</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatDateTime(latestPresenceAt(selectedCafe))}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] text-slate-500">آخر فتح تطبيق</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatDateTime(selectedCafe.last_app_opened_at)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] text-slate-500">آخر نشاط تشغيلي</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatDateTime(operationalActivityAt(selectedCafe))}</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div>المالك الرئيسي: {selectedCafe.owners?.[0]?.full_name ?? '—'}</div>
                    <div>{selectedCafe.current_subscription ? countdownLabel(selectedCafe.current_subscription.countdown_seconds) : 'بدون اشتراك'}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setView('cafes')} className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">العودة للقهاوي</button>
                  <Link href={`/platform/cafes/${selectedCafe.id}`} className="flex-1 rounded-2xl bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white">فتح القهوة</Link>
                </div>
              </div>
            ) : null}
          </aside>

          <section className="space-y-6">
            <header className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-sm font-semibold text-indigo-600">Control Panel</div>
                  <h1 className="mt-1 text-2xl font-bold text-slate-900">إدارة القهاوي والاشتراكات والدعم الفني</h1>
                  <p className="mt-2 text-sm text-slate-500">واجهة أنظف وأسرع للوصول إلى القرار: من سيدفع، من يحتاج متابعة، ومن أرسل رسالة دعم جديدة.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void loadCafes(selectedCafeId).then(() => setRefreshKey((value) => value + 1))} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">تحديث الكل</button>
                  <button type="button" onClick={() => setView('cafes')} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">إدارة القهاوي</button>
                  <button type="button" onClick={logout} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">تسجيل الخروج</button>
                </div>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-slate-400">⌕</span>
                  <input
                    className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    placeholder="ابحث باسم القهوة أو الـ slug للوصول السريع"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      if (view !== 'cafes') setView('cafes');
                    }}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <HeaderMiniStat title="قهاوي أونلاين" value={String(cafesOnlineNowCount)} helper="Presence حي من التطبيق" />
                  <HeaderMiniStat title="مستخدمون أونلاين" value={String(onlineUsersTotal)} helper="آخر heartbeat خلال 90 ثانية" />
                  <HeaderMiniStat title="شاشات مرئية" value={String(visibleRuntimeTotal)} helper="التطبيق مفتوح ومرئي" />
                  <HeaderMiniStat title="ينتهي قريبًا" value={String(expiringSoon.length)} helper="خلال 7 أيام" />
                </div>
              </div>
            </header>

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

            {view === 'overview' ? (
              <PlatformPortfolioOverview
                selectedCafeId={selectedCafeId}
                onSelectCafe={(id) => {
                  setSelectedCafeId(id);
                  setView('cafes');
                }}
                refreshRevision={refreshKey}
                supportNewCount={supportNewCount}
              />
            ) : null}

            {view === 'cafes' ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_420px]">
                <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-indigo-600">Cafes Registry</div>
                      <h2 className="mt-1 text-xl font-bold text-slate-900">جدول القهاوي</h2>
                      <p className="mt-2 text-sm text-slate-500">الشاشة الأقوى في لوحة السوبر أدمن: بحث سريع، فلترة واضحة، وإجراءات مباشرة بدون ازدحام.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:min-w-[460px]">
                      <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={cafeStatusFilter} onChange={(e) => setCafeStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
                        <option value="all">كل الحالات</option>
                        <option value="active">المفعلة فقط</option>
                        <option value="inactive">المعطلة فقط</option>
                      </select>
                      <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'paid' | 'free' | 'expired' | 'none')}>
                        <option value="all">كل الاشتراكات</option>
                        <option value="paid">مدفوع</option>
                        <option value="free">مجاني / تجريبي</option>
                        <option value="expired">منتهي</option>
                        <option value="none">بدون اشتراك</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard title="كل القهاوي" value={String(cafes.length)} helper="السجل الإداري الكامل" />
                    <MetricCard title="نتائج الفلترة" value={String(filteredCafes.length)} helper="بعد البحث والفلاتر الحالية" tone="sky" />
                    <MetricCard title="ينتهي قريبًا" value={String(expiringSoon.length)} helper="أولوية متابعة قريبة" tone="warn" />
                    <MetricCard title="منتهي" value={String(expiredCafes.length)} helper="تحتاج تحصيلًا أو قرارًا" tone="warn" />
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-3 text-right font-medium">القهوة</th>
                          <th className="px-3 py-3 text-right font-medium">المالك</th>
                          <th className="px-3 py-3 text-right font-medium">الاشتراك</th>
                          <th className="px-3 py-3 text-right font-medium">المدفوع</th>
                          <th className="px-3 py-3 text-right font-medium">آخر نشاط</th>
                          <th className="px-3 py-3 text-right font-medium">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCafes.map((cafe) => {
                          const subscription = cafe.current_subscription ?? null;
                          const isSelected = selectedCafeId === cafe.id;
                          const primaryOwner = cafe.owners?.find((owner) => owner.owner_label === 'owner') ?? cafe.owners?.[0] ?? null;
                          return (
                            <tr key={cafe.id} className={`border-t border-slate-100 align-top ${isSelected ? 'bg-indigo-50/50' : 'bg-white'}`}>
                              <td className="px-3 py-4">
                                <button type="button" onClick={() => setSelectedCafeId(cafe.id)} className="text-right">
                                  <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                                  <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                                </button>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                  <span className={`rounded-full border px-2 py-1 font-semibold ${cafeStatusBadgeClass(cafe.is_active)}`}>{cafe.is_active ? 'مفعلة' : 'معطلة'}</span>
                                  <span className={`rounded-full border px-2 py-1 font-semibold ${presenceBadgeClass(cafe)}`}>{presenceLabel(cafe)}</span>
                                  {subscription ? <span className={`rounded-full border px-2 py-1 font-semibold ${subscriptionBadgeClass(subscription.effective_status)}`}>{subscription.effective_status}</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600">بدون اشتراك</span>}
                                </div>
                              </td>
                              <td className="px-3 py-4 text-slate-700">
                                <div className="font-medium text-slate-900">{primaryOwner?.full_name ?? '—'}</div>
                                <div className="mt-1 text-xs text-slate-500">{primaryOwner?.phone ?? 'لا يوجد مالك محدد'}</div>
                                <div className="mt-2 text-xs text-slate-500">{cafe.active_owner_count ?? 0}/{cafe.owner_count ?? 0} نشط</div>
                              </td>
                              <td className="px-3 py-4 text-slate-700">
                                {subscription ? (
                                  <>
                                    <div>حتى {formatDateTime(subscription.ends_at)}</div>
                                    <div className="mt-1 text-xs text-slate-500">{countdownLabel(subscription.countdown_seconds)}</div>
                                  </>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-4 text-slate-700">
                                {subscription ? (
                                  <>
                                    <div>{subscription.is_complimentary ? 'مجاني / استثنائي' : `${amountLabel(subscription.amount_paid)} ج.م`}</div>
                                    {subscription.notes ? <div className="mt-1 text-xs text-slate-500">{subscription.notes}</div> : null}
                                  </>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-4 text-slate-700">
                                <div className="space-y-1 text-xs">
                                  <div><span className="text-slate-500">آخر ظهور:</span> {formatDateTime(latestPresenceAt(cafe))}</div>
                                  <div><span className="text-slate-500">فتح التطبيق:</span> {formatDateTime(cafe.last_app_opened_at)}</div>
                                  <div><span className="text-slate-500">نشاط تشغيلي:</span> {formatDateTime(operationalActivityAt(cafe))}</div>
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex flex-wrap gap-2">
                                  <Link href={`/platform/cafes/${cafe.id}`} className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">التفاصيل</Link>
                                  <button type="button" disabled={busy} onClick={() => void submitToggleCafe(cafe.id, !cafe.is_active)} className={`rounded-2xl px-3 py-2 text-xs font-medium text-white ${cafe.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}>
                                    {cafe.is_active ? 'تعطيل' : 'تفعيل'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredCafes.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-10 text-center text-slate-500">لا توجد قهاوي مطابقة للبحث أو الفلاتر الحالية.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="space-y-6">
                  <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-indigo-600">Quick Create</div>
                        <h2 className="mt-1 text-xl font-bold text-slate-900">إنشاء قهوة جديدة</h2>
                      </div>
                      <button type="button" onClick={() => setCreateCafe((value) => ({ ...value, ...applyPreset(30, true, 'trial'), amountPaid: '0', notes: '', databaseKey: value.databaseKey }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">30 يوم مجاني</button>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="slug القهوة" value={createCafe.cafeSlug} onChange={(e) => setCreateCafe((v) => ({ ...v, cafeSlug: e.target.value }))} />
                      <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="اسم القهوة" value={createCafe.cafeDisplayName} onChange={(e) => setCreateCafe((v) => ({ ...v, cafeDisplayName: e.target.value }))} />
                      <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="اسم المالك" value={createCafe.ownerFullName} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerFullName: e.target.value }))} />
                      <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="رقم هاتف المالك" value={createCafe.ownerPhone} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerPhone: e.target.value }))} />
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">لن تُدخل كلمة المرور من لوحة المنصة. سيتم إصدار كود تفعيل لمرة واحدة، والمالك هو من سيحدد كلمة المرور بنفسه.</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={createCafe.startsAt} onChange={(e) => setCreateCafe((v) => ({ ...v, startsAt: e.target.value }))} />
                        <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={createCafe.endsAt} onChange={(e) => setCreateCafe((v) => ({ ...v, endsAt: e.target.value }))} />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="أيام السماح" value={createCafe.graceDays} onChange={(e) => setCreateCafe((v) => ({ ...v, graceDays: e.target.value }))} />
                        <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="القيمة المدفوعة" value={createCafe.amountPaid} onChange={(e) => setCreateCafe((v) => ({ ...v, amountPaid: e.target.value }))} />
                      </div>
                      <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={createCafe.status} onChange={(e) => setCreateCafe((v) => ({ ...v, status: e.target.value as SubscriptionStatus }))}>
                        <option value="trial">تجريبي</option>
                        <option value="active">نشط</option>
                        <option value="suspended">معلق</option>
                        <option value="expired">منتهي</option>
                      </select>
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <input type="checkbox" checked={createCafe.isComplimentary} onChange={(e) => setCreateCafe((v) => ({ ...v, isComplimentary: e.target.checked, amountPaid: e.target.checked ? '0' : v.amountPaid }))} />
                        مجاني / استثنائي
                      </label>
                      <textarea className="min-h-24 rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="ملاحظة الاشتراك أو التحصيل" value={createCafe.notes} onChange={(e) => setCreateCafe((v) => ({ ...v, notes: e.target.value }))} />
                      <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={createCafe.databaseKey} onChange={(e) => setCreateCafe((v) => ({ ...v, databaseKey: e.target.value }))}>
                        {databaseOptions.length === 0 ? <option value="">لا توجد قواعد تشغيل متاحة</option> : null}
                        {databaseOptions.map((item) => (
                          <option key={item.database_key} value={item.database_key}>{item.display_name}</option>
                        ))}
                      </select>
                      {createCafeInvite ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          <div className="font-semibold">كود تفعيل كلمة المرور للمالك</div>
                          <div className="mt-2">القهوة: <strong>{createCafeInvite.cafeSlug}</strong></div>
                          <div>الهاتف: <strong>{createCafeInvite.ownerPhone}</strong></div>
                          <div className="mt-3 rounded-2xl border border-amber-300 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.3em]">{createCafeInvite.code}</div>
                          <div className="mt-2 text-xs text-amber-800">الصلاحية حتى {formatDateTime(createCafeInvite.expiresAt)}.</div>
                        </div>
                      ) : null}
                      <button disabled={busy || !createCafe.databaseKey} onClick={submitCreateCafe} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                        إنشاء القهوة وإصدار كود التفعيل
                      </button>
                    </div>
                  </section>

                  <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-sm font-semibold text-indigo-600">Focus Queue</div>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">متابعة قريبة</h3>
                    <div className="mt-4 space-y-3">
                      {expiringSoon.map((cafe) => (
                        <button key={cafe.id} type="button" onClick={() => setSelectedCafeId(cafe.id)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right">
                          <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{cafe.slug}</div>
                          <div className="mt-2 text-sm text-slate-700">{formatDateTime(cafe.current_subscription?.ends_at)}</div>
                          <div className="mt-1 text-xs text-slate-500">{countdownLabel(cafe.current_subscription?.countdown_seconds ?? 0)}</div>
                        </button>
                      ))}
                      {expiringSoon.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد استحقاقات قريبة الآن.</div> : null}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}

            {view === 'money' ? <MoneyFollowSection refreshKey={refreshKey} /> : null}
            {view === 'support' ? <SupportSection refreshKey={refreshKey} selectedCafeId={selectedCafeId} /> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
