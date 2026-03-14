'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';
import PlatformPortfolioOverview from './PlatformPortfolioOverview';

type OwnerLabel = 'owner' | 'partner';
type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
type ViewKey = 'overview' | 'cafes' | 'owners' | 'money' | 'subscriptions';

type CafeSubscriptionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  grace_days: number;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  countdown_seconds: number;
};

type OwnerUser = {
  owner_user_id: string;
  cafe_id: string;
  full_name: string;
  phone: string;
  owner_label: OwnerLabel;
  is_active: boolean;
  created_at: string;
};

type CafeOwnerRow = {
  id: string;
  full_name: string;
  phone: string;
  owner_label: OwnerLabel;
  is_active: boolean;
  created_at: string;
};

type CafeRow = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  owner_count?: number;
  active_owner_count?: number;
  owners?: CafeOwnerRow[];
  current_subscription?: CafeSubscriptionRow | null;
};

type CafeListResponse = { ok: true; items: CafeRow[] };
type OwnerListResponse = { ok: true; items: OwnerUser[] };
type SubscriptionListResponse = { ok: true; items: CafeSubscriptionRow[] };
type CreateCafeResponse = { ok: true; data?: { cafe_id?: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOwnerLabel(value: unknown): value is OwnerLabel {
  return value === 'owner' || value === 'partner';
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
    (typeof value.notes === 'string' || value.notes === null) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.countdown_seconds === 'number'
  );
}

function isCafeOwnerRow(value: unknown): value is CafeOwnerRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.full_name === 'string' &&
    typeof value.phone === 'string' &&
    isOwnerLabel(value.owner_label) &&
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
    (typeof value.owner_count === 'undefined' || typeof value.owner_count === 'number') &&
    (typeof value.active_owner_count === 'undefined' || typeof value.active_owner_count === 'number') &&
    (typeof value.owners === 'undefined' || (Array.isArray(value.owners) && value.owners.every(isCafeOwnerRow))) &&
    (typeof value.current_subscription === 'undefined' || value.current_subscription === null || isCafeSubscriptionRow(value.current_subscription))
  );
}

function isOwnerUser(value: unknown): value is OwnerUser {
  return (
    isRecord(value) &&
    typeof value.owner_user_id === 'string' &&
    typeof value.cafe_id === 'string' &&
    typeof value.full_name === 'string' &&
    typeof value.phone === 'string' &&
    isOwnerLabel(value.owner_label) &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string'
  );
}

function isCafeListResponse(value: unknown): value is CafeListResponse {
  return isRecord(value) && value.ok === true && Array.isArray(value.items) && value.items.every(isCafeRow);
}

function isOwnerListResponse(value: unknown): value is OwnerListResponse {
  return isRecord(value) && value.ok === true && Array.isArray(value.items) && value.items.every(isOwnerUser);
}

function isSubscriptionListResponse(value: unknown): value is SubscriptionListResponse {
  return isRecord(value) && value.ok === true && Array.isArray(value.items) && value.items.every(isCafeSubscriptionRow);
}

function isCreateCafeResponse(value: unknown): value is CreateCafeResponse {
  if (!isRecord(value) || value.ok !== true) return false;
  if (typeof value.data === 'undefined') return true;
  return isRecord(value.data) && (typeof value.data.cafe_id === 'undefined' || typeof value.data.cafe_id === 'string');
}

function createPlatformError(payload: unknown, fallback: string) {
  return new Error(extractPlatformApiErrorMessage(payload, fallback));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function countdownLabel(totalSeconds: number) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  if (days > 0) return `${days} يوم و ${hours} ساعة`;
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ساعة و ${minutes} دقيقة`;
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

function ownerLabelText(label: OwnerLabel) {
  return label === 'owner' ? 'مالك' : 'شريك';
}

function statusBadgeClass(active: boolean) {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
}

const views: Array<{ key: ViewKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'cafes', label: 'Cafes' },
  { key: 'owners', label: 'Owners' },
  { key: 'money', label: 'Money Follow' },
  { key: 'subscriptions', label: 'Subscriptions' },
];

export default function PlatformDashboardClient({ session }: { session: PlatformAdminSession }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<ViewKey>('overview');
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [subscriptions, setSubscriptions] = useState<CafeSubscriptionRow[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [portfolioRefreshRevision, setPortfolioRefreshRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [cafeStatusFilter, setCafeStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [createCafe, setCreateCafe] = useState({
    cafeSlug: '',
    cafeDisplayName: '',
    ownerFullName: '',
    ownerPhone: '',
    ownerPassword: '',
  });
  const [createOwner, setCreateOwner] = useState({
    fullName: '',
    phone: '',
    password: '',
    ownerLabel: 'partner' as OwnerLabel,
  });
  const [editOwner, setEditOwner] = useState({
    ownerUserId: '',
    fullName: '',
    phone: '',
    ownerLabel: 'partner' as OwnerLabel,
  });
  const [resetPassword, setResetPassword] = useState({
    ownerUserId: '',
    newPassword: '',
  });
  const [subscriptionForm, setSubscriptionForm] = useState({
    startsAt: toDateInputValue(today),
    endsAt: toDateInputValue(new Date(today.getTime() + 1000 * 60 * 60 * 24 * 365)),
    graceDays: '0',
    status: 'active' as SubscriptionStatus,
    notes: '',
  });

  const loadCafes = useCallback(async (preferredCafeId?: string) => {
    const res = await fetch('/api/platform/cafes/list', { cache: 'no-store' });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_CAFES_FAILED');

    const items = isCafeListResponse(json) ? json.items : [];
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

  const loadOwners = useCallback(async (cafeId: string) => {
    if (!cafeId) {
      setOwners([]);
      return;
    }
    const res = await fetch('/api/platform/owners/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cafeId }),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_OWNERS_FAILED');
    const items = isOwnerListResponse(json) ? json.items : [];
    setOwners(items);
  }, []);

  const loadSubscriptions = useCallback(async (cafeId: string) => {
    if (!cafeId) {
      setSubscriptions([]);
      return;
    }
    const res = await fetch('/api/platform/subscriptions/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cafeId }),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'LOAD_SUBSCRIPTIONS_FAILED');
    setSubscriptions(isSubscriptionListResponse(json) ? json.items : []);
  }, []);

  const refreshSelectedCafe = useCallback(async (preferredCafeId?: string) => {
    const cafeId = await loadCafes(preferredCafeId);
    await Promise.all([loadOwners(cafeId), loadSubscriptions(cafeId)]);
    setPortfolioRefreshRevision((value) => value + 1);
  }, [loadCafes, loadOwners, loadSubscriptions]);

  useEffect(() => {
    void refreshSelectedCafe().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_PLATFORM_FAILED');
    });
  }, [refreshSelectedCafe]);

  useEffect(() => {
    if (!selectedCafeId) {
      setOwners([]);
      setSubscriptions([]);
      return;
    }
    void Promise.all([loadOwners(selectedCafeId), loadSubscriptions(selectedCafeId)]).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'LOAD_SELECTED_CAFE_FAILED');
    });
  }, [selectedCafeId, loadOwners, loadSubscriptions]);

  const filteredCafes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cafes.filter((cafe) => {
      if (cafeStatusFilter === 'active' && !cafe.is_active) return false;
      if (cafeStatusFilter === 'inactive' && cafe.is_active) return false;
      if (!query) return true;
      return cafe.display_name.toLowerCase().includes(query) || cafe.slug.toLowerCase().includes(query);
    });
  }, [cafes, search, cafeStatusFilter]);

  const selectedCafe = useMemo(() => cafes.find((item) => item.id === selectedCafeId) ?? null, [cafes, selectedCafeId]);
  const currentSubscription = selectedCafe?.current_subscription ?? null;

  async function submitCreateCafe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/cafes/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createCafe),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'CREATE_CAFE_FAILED');

      setCreateCafe({ cafeSlug: '', cafeDisplayName: '', ownerFullName: '', ownerPhone: '', ownerPassword: '' });
      const createdCafeId = isCreateCafeResponse(json) && typeof json.data?.cafe_id === 'string' ? json.data.cafe_id : undefined;
      await refreshSelectedCafe(createdCafeId);
      setView('cafes');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'CREATE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateOwner() {
    if (!selectedCafeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/owners/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafeId: selectedCafeId,
          fullName: createOwner.fullName,
          phone: createOwner.phone,
          password: createOwner.password,
          ownerLabel: createOwner.ownerLabel,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'CREATE_OWNER_FAILED');
      setCreateOwner({ fullName: '', phone: '', password: '', ownerLabel: 'partner' });
      await refreshSelectedCafe(selectedCafeId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'CREATE_OWNER_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitUpdateOwner() {
    if (!selectedCafeId || !editOwner.ownerUserId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/owners/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafeId: selectedCafeId,
          ownerUserId: editOwner.ownerUserId,
          fullName: editOwner.fullName,
          phone: editOwner.phone,
          ownerLabel: editOwner.ownerLabel,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'UPDATE_OWNER_FAILED');
      await refreshSelectedCafe(selectedCafeId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'UPDATE_OWNER_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitToggleOwner(owner: OwnerUser, isActive: boolean) {
    if (!selectedCafeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/owners/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cafeId: selectedCafeId, ownerUserId: owner.owner_user_id, isActive }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'TOGGLE_OWNER_FAILED');
      await refreshSelectedCafe(selectedCafeId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'TOGGLE_OWNER_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitResetOwnerPassword() {
    if (!selectedCafeId || !resetPassword.ownerUserId || !resetPassword.newPassword) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/owners/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafeId: selectedCafeId,
          ownerUserId: resetPassword.ownerUserId,
          newPassword: resetPassword.newPassword,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'RESET_OWNER_PASSWORD_FAILED');
      setResetPassword({ ownerUserId: '', newPassword: '' });
      await loadOwners(selectedCafeId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'RESET_OWNER_PASSWORD_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitToggleCafe(isActive: boolean) {
    if (!selectedCafeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/cafes/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cafeId: selectedCafeId, isActive }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'TOGGLE_CAFE_FAILED');
      await refreshSelectedCafe(selectedCafeId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'TOGGLE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitSubscription() {
    if (!selectedCafeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/subscriptions/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cafeId: selectedCafeId,
          startsAt: fromDateInputValue(subscriptionForm.startsAt),
          endsAt: fromDateInputValue(subscriptionForm.endsAt),
          graceDays: Number(subscriptionForm.graceDays || '0'),
          status: subscriptionForm.status,
          notes: subscriptionForm.notes,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok || !isPlatformApiOk(json)) throw createPlatformError(json, 'SAVE_SUBSCRIPTION_FAILED');
      await refreshSelectedCafe(selectedCafeId);
      setView('subscriptions');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'SAVE_SUBSCRIPTION_FAILED');
    } finally {
      setBusy(false);
    }
  }

  function applySubscriptionPreset(days: number, status: SubscriptionStatus) {
    const start = new Date();
    const end = new Date(start.getTime() + 1000 * 60 * 60 * 24 * days);
    setSubscriptionForm((value) => ({
      ...value,
      startsAt: toDateInputValue(start),
      endsAt: toDateInputValue(end),
      status,
    }));
  }

  async function logout() {
    await fetch('/api/platform/auth/logout', { method: 'POST' });
    router.replace('/platform/login');
    router.refresh();
  }

  return (
    <main className="min-h-dvh bg-slate-100 p-6 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">لوحة السوبر أدمن</h1>
            <p className="mt-1 text-sm text-slate-600">{session.displayName} — {session.email}</p>
            <p className="mt-1 text-xs text-slate-500">واجهة إدارية فقط. بيانات التشغيل الحساسة للمقاهي غير معروضة هنا.</p>
          </div>
          <button onClick={logout} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium">
            خروج
          </button>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          {views.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                view === item.key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view === 'overview' ? (
          <PlatformPortfolioOverview
            selectedCafeId={selectedCafeId}
            onSelectCafe={setSelectedCafeId}
            refreshRevision={portfolioRefreshRevision}
          />
        ) : null}

        {view === 'cafes' ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">إنشاء قهوة + مالك أساسي</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="slug" value={createCafe.cafeSlug} onChange={(e) => setCreateCafe((v) => ({ ...v, cafeSlug: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="اسم القهوة" value={createCafe.cafeDisplayName} onChange={(e) => setCreateCafe((v) => ({ ...v, cafeDisplayName: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="اسم المالك" value={createCafe.ownerFullName} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerFullName: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم المالك" value={createCafe.ownerPhone} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerPhone: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" type="password" placeholder="باسورد المالك" value={createCafe.ownerPassword} onChange={(e) => setCreateCafe((v) => ({ ...v, ownerPassword: e.target.value }))} />
              </div>
              <button disabled={busy} onClick={submitCreateCafe} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60">
                إنشاء القهوة
              </button>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-bold">المقاهي</h2>
                  <p className="mt-1 text-sm text-slate-500">إدارة التفعيل، البحث، وفتح التفاصيل الإدارية لكل قهوة.</p>
                </div>
                <div className="grid w-full gap-3 md:max-w-xl md:grid-cols-[1.5fr_1fr]">
                  <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="ابحث باسم القهوة أو الـ slug" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select className="rounded-2xl border border-slate-200 px-4 py-3" value={cafeStatusFilter} onChange={(e) => setCafeStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
                    <option value="all">كل الحالات</option>
                    <option value="active">المفعلة فقط</option>
                    <option value="inactive">المعطلة فقط</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-2">
                  {filteredCafes.map((cafe) => (
                    <button
                      key={cafe.id}
                      type="button"
                      onClick={() => setSelectedCafeId(cafe.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-right ${selectedCafeId === cafe.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{cafe.display_name}</div>
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadgeClass(cafe.is_active)}`}>{cafe.is_active ? 'مفعلة' : 'معطلة'}</span>
                      </div>
                      <div className="mt-1 text-xs opacity-80">{cafe.slug}</div>
                    </button>
                  ))}
                  {filteredCafes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد نتائج مطابقة.</div> : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {selectedCafe ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-bold text-slate-900">{selectedCafe.display_name}</div>
                          <div className="mt-1 text-sm text-slate-500">{selectedCafe.slug}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/platform/cafes/${selectedCafe.id}`} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">فتح التفاصيل</Link>
                          <button disabled={busy} onClick={() => submitToggleCafe(!selectedCafe.is_active)} className={`rounded-2xl px-4 py-2 text-sm font-medium text-white ${selectedCafe.is_active ? 'bg-rose-600' : 'bg-emerald-600'} disabled:opacity-60`}>
                            {selectedCafe.is_active ? 'تعطيل القهوة' : 'تفعيل القهوة'}
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                          <div>أُنشئت في <strong>{formatDateTime(selectedCafe.created_at)}</strong></div>
                          <div className="mt-1">الحسابات النشطة: <strong>{selectedCafe.active_owner_count ?? 0}</strong></div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                          {currentSubscription ? (
                            <>
                              <div>الاشتراك: <span className={`rounded-full border px-2 py-1 text-xs ${subscriptionBadgeClass(currentSubscription.effective_status)}`}>{currentSubscription.effective_status}</span></div>
                              <div className="mt-2">ينتهي في <strong>{formatDateTime(currentSubscription.ends_at)}</strong></div>
                              <div className="mt-1 text-xs text-slate-500">{countdownLabel(currentSubscription.countdown_seconds)}</div>
                            </>
                          ) : <div>لا يوجد اشتراك حالي.</div>}
                        </div>
                      </div>
                    </>
                  ) : <div className="text-sm text-slate-500">اختر قهوة من القائمة.</div>}
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {view === 'owners' ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">إضافة مالك أو شريك</h2>
                  <p className="mt-1 text-sm text-slate-500">القهوة المختارة: {selectedCafe ? `${selectedCafe.display_name} (${selectedCafe.slug})` : '—'}</p>
                </div>
              </div>
              <div className="space-y-3">
                <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={createOwner.ownerLabel} onChange={(e) => setCreateOwner((v) => ({ ...v, ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner' }))}>
                  <option value="partner">شريك</option>
                  <option value="owner">مالك</option>
                </select>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="الاسم" value={createOwner.fullName} onChange={(e) => setCreateOwner((v) => ({ ...v, fullName: e.target.value }))} />
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم الهاتف" value={createOwner.phone} onChange={(e) => setCreateOwner((v) => ({ ...v, phone: e.target.value }))} />
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" type="password" placeholder="الباسورد" value={createOwner.password} onChange={(e) => setCreateOwner((v) => ({ ...v, password: e.target.value }))} />
              </div>
              <button disabled={busy || !selectedCafeId} onClick={submitCreateOwner} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60">إضافة الحساب</button>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">الحسابات الحالية</h2>
              <div className="mt-4 space-y-3">
                {owners.map((owner) => (
                  <div key={owner.owner_user_id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">{owner.full_name}</div>
                        <div className="mt-1 text-sm text-slate-500">{owner.phone}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">{ownerLabelText(owner.owner_label)}</span>
                        <span className={`rounded-full border px-2 py-1 font-semibold ${statusBadgeClass(owner.is_active)}`}>{owner.is_active ? 'نشط' : 'موقوف'}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditOwner({ ownerUserId: owner.owner_user_id, fullName: owner.full_name, phone: owner.phone, ownerLabel: owner.owner_label }); setView('owners'); }} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">تجهيز للتعديل</button>
                      <button type="button" disabled={busy} onClick={() => submitToggleOwner(owner, !owner.is_active)} className={`rounded-2xl px-3 py-2 text-sm font-medium text-white ${owner.is_active ? 'bg-rose-600' : 'bg-emerald-600'}`}>{owner.is_active ? 'إيقاف' : 'تفعيل'}</button>
                      <button type="button" onClick={() => setResetPassword((v) => ({ ...v, ownerUserId: owner.owner_user_id }))} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">تجهيز لتغيير الباسورد</button>
                    </div>
                  </div>
                ))}
                {owners.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا توجد حسابات بعد.</div> : null}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">تعديل حساب</h2>
              <div className="mt-4 grid gap-3">
                <select className="rounded-2xl border border-slate-200 px-4 py-3" value={editOwner.ownerUserId} onChange={(e) => {
                  const found = owners.find((item) => item.owner_user_id === e.target.value);
                  setEditOwner(found ? { ownerUserId: found.owner_user_id, fullName: found.full_name, phone: found.phone, ownerLabel: found.owner_label } : { ownerUserId: '', fullName: '', phone: '', ownerLabel: 'partner' });
                }}>
                  <option value="">اختر الحساب</option>
                  {owners.map((owner) => <option key={owner.owner_user_id} value={owner.owner_user_id}>{owner.full_name}</option>)}
                </select>
                <select className="rounded-2xl border border-slate-200 px-4 py-3" value={editOwner.ownerLabel} onChange={(e) => setEditOwner((v) => ({ ...v, ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner' }))}>
                  <option value="partner">شريك</option>
                  <option value="owner">مالك</option>
                </select>
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="الاسم" value={editOwner.fullName} onChange={(e) => setEditOwner((v) => ({ ...v, fullName: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="رقم الهاتف" value={editOwner.phone} onChange={(e) => setEditOwner((v) => ({ ...v, phone: e.target.value }))} />
              </div>
              <button disabled={busy || !editOwner.ownerUserId} onClick={submitUpdateOwner} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60">حفظ التعديل</button>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">إعادة تعيين باسورد المالك</h2>
              <div className="mt-4 grid gap-3">
                <select className="rounded-2xl border border-slate-200 px-4 py-3" value={resetPassword.ownerUserId} onChange={(e) => setResetPassword((v) => ({ ...v, ownerUserId: e.target.value }))}>
                  <option value="">اختر الحساب</option>
                  {owners.map((owner) => <option key={owner.owner_user_id} value={owner.owner_user_id}>{owner.full_name}</option>)}
                </select>
                <input className="rounded-2xl border border-slate-200 px-4 py-3" type="password" placeholder="الباسورد الجديد" value={resetPassword.newPassword} onChange={(e) => setResetPassword((v) => ({ ...v, newPassword: e.target.value }))} />
              </div>
              <button disabled={busy || !resetPassword.ownerUserId || !resetPassword.newPassword} onClick={submitResetOwnerPassword} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60">تغيير الباسورد</button>
            </section>
          </div>
        ) : null}

        {view === 'money' ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Money Follow</h2>
              <p className="mt-1 text-sm text-slate-500">متابعة مالية إدارية للاشتراكات فقط، بدون عرض مبيعات أو تشغيل داخلي للمقهى.</p>
              <div className="mt-4 space-y-3">
                {cafes.map((cafe) => (
                  <div key={cafe.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">{cafe.display_name}</div>
                      {cafe.current_subscription ? <span className={`rounded-full border px-2 py-1 text-xs ${subscriptionBadgeClass(cafe.current_subscription.effective_status)}`}>{cafe.current_subscription.effective_status}</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">بدون اشتراك</span>}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{cafe.slug}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      {cafe.current_subscription ? `ينتهي: ${formatDateTime(cafe.current_subscription.ends_at)} • ${countdownLabel(cafe.current_subscription.countdown_seconds)}` : 'لا يوجد حد اشتراك حالي.'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">القهوة المختارة</h2>
              {selectedCafe ? (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-900">{selectedCafe.display_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{selectedCafe.slug}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    {currentSubscription ? (
                      <>
                        <div>الحالة: <strong>{currentSubscription.effective_status}</strong></div>
                        <div className="mt-1">البداية: <strong>{formatDateTime(currentSubscription.starts_at)}</strong></div>
                        <div className="mt-1">النهاية: <strong>{formatDateTime(currentSubscription.ends_at)}</strong></div>
                        <div className="mt-1">العد التنازلي: <strong>{countdownLabel(currentSubscription.countdown_seconds)}</strong></div>
                        {currentSubscription.notes ? <div className="mt-2 text-xs text-slate-500">{currentSubscription.notes}</div> : null}
                      </>
                    ) : <div>لا يوجد اشتراك مسجل.</div>}
                  </div>
                  <Link href={`/platform/cafes/${selectedCafe.id}`} className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">فتح التفاصيل الإدارية</Link>
                </div>
              ) : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">اختر قهوة أولًا.</div>}
            </section>
          </div>
        ) : null}

        {view === 'subscriptions' ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">إدارة الاشتراكات</h2>
              <p className="mt-1 text-sm text-slate-500">القهوة المختارة: {selectedCafe ? `${selectedCafe.display_name} (${selectedCafe.slug})` : '—'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => applySubscriptionPreset(30, 'trial')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">30 يوم تجريبي</button>
                <button type="button" onClick={() => applySubscriptionPreset(365, 'active')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">سنة مدفوعة</button>
                <button type="button" onClick={() => applySubscriptionPreset(30, 'active')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">شهر مدفوع</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3" value={subscriptionForm.startsAt} onChange={(e) => setSubscriptionForm((v) => ({ ...v, startsAt: e.target.value }))} />
                <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3" value={subscriptionForm.endsAt} onChange={(e) => setSubscriptionForm((v) => ({ ...v, endsAt: e.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3" placeholder="أيام السماح" value={subscriptionForm.graceDays} onChange={(e) => setSubscriptionForm((v) => ({ ...v, graceDays: e.target.value }))} />
                <select className="rounded-2xl border border-slate-200 px-4 py-3" value={subscriptionForm.status} onChange={(e) => setSubscriptionForm((v) => ({ ...v, status: e.target.value as SubscriptionStatus }))}>
                  <option value="active">active</option>
                  <option value="trial">trial</option>
                  <option value="expired">expired</option>
                  <option value="suspended">suspended</option>
                </select>
                <textarea className="min-h-28 rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" placeholder="ملاحظات الاشتراك" value={subscriptionForm.notes} onChange={(e) => setSubscriptionForm((v) => ({ ...v, notes: e.target.value }))} />
              </div>
              <button disabled={busy || !selectedCafeId} onClick={submitSubscription} className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60">حفظ الاشتراك</button>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">سجل الاشتراكات</h2>
              <div className="mt-4 space-y-3">
                {subscriptions.map((subscription) => (
                  <div key={subscription.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs ${subscriptionBadgeClass(subscription.effective_status)}`}>{subscription.effective_status}</span>
                      <span className="text-xs text-slate-500">{countdownLabel(subscription.countdown_seconds)}</span>
                    </div>
                    <div className="mt-2">البداية: <strong>{formatDateTime(subscription.starts_at)}</strong></div>
                    <div className="mt-1">النهاية: <strong>{formatDateTime(subscription.ends_at)}</strong></div>
                    <div className="mt-1">أيام السماح: <strong>{subscription.grace_days}</strong></div>
                    {subscription.notes ? <div className="mt-2 text-xs text-slate-500">{subscription.notes}</div> : null}
                  </div>
                ))}
                {subscriptions.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">لا يوجد سجل اشتراكات بعد.</div> : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
