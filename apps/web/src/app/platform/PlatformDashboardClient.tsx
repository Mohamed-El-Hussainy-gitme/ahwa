'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

type OwnerLabel = 'owner' | 'partner';
type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

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

type CafeListResponse = {
  ok: true;
  items: CafeRow[];
};

type OwnerListResponse = {
  ok: true;
  items: OwnerUser[];
};

type SubscriptionListResponse = {
  ok: true;
  items: CafeSubscriptionRow[];
};

type CreateCafeResponse = {
  ok: true;
  data?: {
    cafe_id?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOwnerLabel(value: unknown): value is OwnerLabel {
  return value === 'owner' || value === 'partner';
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return (
    value === 'trial' ||
    value === 'active' ||
    value === 'expired' ||
    value === 'suspended'
  );
}

function isCafeSubscriptionRow(value: unknown): value is CafeSubscriptionRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.starts_at === 'string' &&
    typeof value.ends_at === 'string' &&
    typeof value.grace_days === 'number' &&
    isSubscriptionStatus(value.status) &&
    isSubscriptionStatus(value.effective_status) &&
    (value.notes === null || typeof value.notes === 'string') &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.countdown_seconds === 'number'
  );
}

function isCafeOwnerRow(value: unknown): value is CafeOwnerRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.full_name === 'string' &&
    typeof value.phone === 'string' &&
    isOwnerLabel(value.owner_label) &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string'
  );
}

function isCafeRow(value: unknown): value is CafeRow {
  if (!isRecord(value)) return false;

  const owners = value.owners;
  const currentSubscription = value.current_subscription;

  return (
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string' &&
    (typeof value.owner_count === 'undefined' || typeof value.owner_count === 'number') &&
    (typeof value.active_owner_count === 'undefined' ||
      typeof value.active_owner_count === 'number') &&
    (typeof owners === 'undefined' || (Array.isArray(owners) && owners.every(isCafeOwnerRow))) &&
    (typeof currentSubscription === 'undefined' ||
      currentSubscription === null ||
      isCafeSubscriptionRow(currentSubscription))
  );
}

function isOwnerUser(value: unknown): value is OwnerUser {
  if (!isRecord(value)) return false;

  return (
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
  return (
    isRecord(value) &&
    value.ok === true &&
    Array.isArray(value.items) &&
    value.items.every(isCafeRow)
  );
}

function isOwnerListResponse(value: unknown): value is OwnerListResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    Array.isArray(value.items) &&
    value.items.every(isOwnerUser)
  );
}

function isSubscriptionListResponse(value: unknown): value is SubscriptionListResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    Array.isArray(value.items) &&
    value.items.every(isCafeSubscriptionRow)
  );
}

function isCreateCafeResponse(value: unknown): value is CreateCafeResponse {
  if (!isRecord(value) || value.ok !== true) {
    return false;
  }

  if (typeof value.data === 'undefined') {
    return true;
  }

  if (!isRecord(value.data)) {
    return false;
  }

  return (
    typeof value.data.cafe_id === 'undefined' ||
    typeof value.data.cafe_id === 'string'
  );
}

function createPlatformError(payload: unknown, fallback: string) {
  return new Error(extractPlatformApiErrorMessage(payload, fallback));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

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

function statusBadgeClass(active: boolean) {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
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
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

export default function PlatformDashboardClient({
  session,
}: {
  session: PlatformAdminSession;
}) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [subscriptions, setSubscriptions] = useState<CafeSubscriptionRow[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState<string>('');
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
  const [supportNotes, setSupportNotes] = useState('');
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

    if (!res.ok || !isPlatformApiOk(json)) {
      throw createPlatformError(json, 'LOAD_CAFES_FAILED');
    }

    const items = isCafeListResponse(json) ? json.items : [];
    setCafes(items);

    const nextSelected =
      preferredCafeId && items.some((item) => item.id === preferredCafeId)
        ? preferredCafeId
        : selectedCafeId && items.some((item) => item.id === selectedCafeId)
          ? selectedCafeId
          : items[0]?.id ?? '';

    setSelectedCafeId(nextSelected);
    return { items, nextSelected };
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

    if (!res.ok || !isPlatformApiOk(json)) {
      throw createPlatformError(json, 'LOAD_OWNERS_FAILED');
    }

    const items = isOwnerListResponse(json) ? json.items : [];
    setOwners(items);

    if (editOwner.ownerUserId) {
      const found = items.find((item) => item.owner_user_id === editOwner.ownerUserId);
      if (found) {
        setEditOwner({
          ownerUserId: found.owner_user_id,
          fullName: found.full_name,
          phone: found.phone,
          ownerLabel: found.owner_label,
        });
      }
    }
  }, [editOwner.ownerUserId]);

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

    if (!res.ok || !isPlatformApiOk(json)) {
      throw createPlatformError(json, 'LOAD_SUBSCRIPTIONS_FAILED');
    }

    setSubscriptions(isSubscriptionListResponse(json) ? json.items : []);
  }, []);

  const refreshSelectedCafe = useCallback(async (preferredCafeId?: string) => {
    const { nextSelected } = await loadCafes(preferredCafeId);
    await Promise.all([loadOwners(nextSelected), loadSubscriptions(nextSelected)]);
  }, [loadCafes, loadOwners, loadSubscriptions]);

  useEffect(() => {
    void refreshSelectedCafe().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'LOAD_PLATFORM_FAILED'),
    );
  }, [refreshSelectedCafe]);

  useEffect(() => {
    if (!selectedCafeId) {
      setOwners([]);
      setSubscriptions([]);
      return;
    }

    void Promise.all([loadOwners(selectedCafeId), loadSubscriptions(selectedCafeId)]).catch(
      (e: unknown) =>
        setError(e instanceof Error ? e.message : 'LOAD_CAFE_DETAILS_FAILED'),
    );
  }, [selectedCafeId, loadOwners, loadSubscriptions]);

  const filteredCafes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cafes.filter((cafe) => {
      if (cafeStatusFilter === 'active' && !cafe.is_active) return false;
      if (cafeStatusFilter === 'inactive' && cafe.is_active) return false;
      if (!query) return true;
      return (
        cafe.display_name.toLowerCase().includes(query) ||
        cafe.slug.toLowerCase().includes(query)
      );
    });
  }, [cafes, search, cafeStatusFilter]);

  const selectedCafe = useMemo(
    () => cafes.find((item) => item.id === selectedCafeId) ?? null,
    [cafes, selectedCafeId],
  );

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

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'CREATE_CAFE_FAILED');
      }

      setCreateCafe({
        cafeSlug: '',
        cafeDisplayName: '',
        ownerFullName: '',
        ownerPhone: '',
        ownerPassword: '',
      });

      const createdCafeId =
        isCreateCafeResponse(json) && typeof json.data?.cafe_id === 'string'
          ? json.data.cafe_id
          : '';

      await refreshSelectedCafe(createdCafeId || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CREATE_CAFE_FAILED');
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

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'CREATE_OWNER_FAILED');
      }

      setCreateOwner({
        fullName: '',
        phone: '',
        password: '',
        ownerLabel: 'partner',
      });
      await refreshSelectedCafe(selectedCafeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CREATE_OWNER_FAILED');
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

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'UPDATE_OWNER_FAILED');
      }

      await refreshSelectedCafe(selectedCafeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'UPDATE_OWNER_FAILED');
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
        body: JSON.stringify({
          cafeId: selectedCafeId,
          ownerUserId: owner.owner_user_id,
          isActive,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'TOGGLE_OWNER_FAILED');
      }

      await refreshSelectedCafe(selectedCafeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TOGGLE_OWNER_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitResetOwnerPassword() {
    if (!selectedCafeId || !resetPassword.ownerUserId || !resetPassword.newPassword) {
      return;
    }

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

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'RESET_OWNER_PASSWORD_FAILED');
      }

      setResetPassword({ ownerUserId: '', newPassword: '' });
      await loadOwners(selectedCafeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RESET_OWNER_PASSWORD_FAILED');
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

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'TOGGLE_CAFE_FAILED');
      }

      await refreshSelectedCafe(selectedCafeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TOGGLE_CAFE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function submitGrantSupport() {
    if (!selectedCafeId) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/platform/support/grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cafeId: selectedCafeId, notes: supportNotes }),
      });
      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'GRANT_SUPPORT_FAILED');
      }

      setSupportNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'GRANT_SUPPORT_FAILED');
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

      if (!res.ok || !isPlatformApiOk(json)) {
        throw createPlatformError(json, 'SAVE_SUBSCRIPTION_FAILED');
      }

      await refreshSelectedCafe(selectedCafeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SAVE_SUBSCRIPTION_FAILED');
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
    <main className="min-h-dvh bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">لوحة السوبر أدمن</h1>
            <p className="mt-1 text-sm text-slate-600">
              {session.displayName} — {session.email}
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            خروج
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">إنشاء قهوة + مالك أساسي</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                className="rounded-2xl border border-slate-200 px-4 py-3"
                placeholder="slug"
                value={createCafe.cafeSlug}
                onChange={(e) =>
                  setCreateCafe((v) => ({ ...v, cafeSlug: e.target.value }))
                }
              />
              <input
                className="rounded-2xl border border-slate-200 px-4 py-3"
                placeholder="اسم القهوة"
                value={createCafe.cafeDisplayName}
                onChange={(e) =>
                  setCreateCafe((v) => ({ ...v, cafeDisplayName: e.target.value }))
                }
              />
              <input
                className="rounded-2xl border border-slate-200 px-4 py-3"
                placeholder="اسم المالك"
                value={createCafe.ownerFullName}
                onChange={(e) =>
                  setCreateCafe((v) => ({ ...v, ownerFullName: e.target.value }))
                }
              />
              <input
                className="rounded-2xl border border-slate-200 px-4 py-3"
                placeholder="رقم المالك"
                value={createCafe.ownerPhone}
                onChange={(e) =>
                  setCreateCafe((v) => ({ ...v, ownerPhone: e.target.value }))
                }
              />
              <input
                className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2"
                type="password"
                placeholder="باسورد المالك"
                value={createCafe.ownerPassword}
                onChange={(e) =>
                  setCreateCafe((v) => ({ ...v, ownerPassword: e.target.value }))
                }
              />
            </div>
            <button
              disabled={busy}
              onClick={submitCreateCafe}
              className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
            >
              إنشاء القهوة
            </button>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">البحث والفلترة</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr_1fr]">
              <input
                className="rounded-2xl border border-slate-200 px-4 py-3"
                placeholder="ابحث باسم القهوة أو الـ slug"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="rounded-2xl border border-slate-200 px-4 py-3"
                value={cafeStatusFilter}
                onChange={(e) =>
                  setCafeStatusFilter(e.target.value as 'all' | 'active' | 'inactive')
                }
              >
                <option value="all">كل الحالات</option>
                <option value="active">المفعلة فقط</option>
                <option value="inactive">المعطلة فقط</option>
              </select>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              إجمالي النتائج: {filteredCafes.length}
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">المقاهي</h2>
            <div className="mt-4 space-y-2">
              {filteredCafes.map((cafe) => (
                <button
                  key={cafe.id}
                  onClick={() => setSelectedCafeId(cafe.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-right ${
                    selectedCafeId === cafe.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">{cafe.display_name}</div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] ${statusBadgeClass(
                        cafe.is_active,
                      )}`}
                    >
                      {cafe.is_active ? 'مفعلة' : 'معطلة'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs opacity-80">{cafe.slug}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] opacity-80">
                    <span>الحسابات: {cafe.owner_count ?? 0}</span>
                    <span>النشطة: {cafe.active_owner_count ?? 0}</span>
                    {cafe.current_subscription ? (
                      <span>
                        الاشتراك: {cafe.current_subscription.effective_status}
                      </span>
                    ) : (
                      <span>بدون اشتراك</span>
                    )}
                  </div>
                </button>
              ))}
              {filteredCafes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  لا توجد نتائج مطابقة
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-bold">بيانات القهوة المختارة</h2>
                  <div className="mt-2 text-sm text-slate-600">
                    {selectedCafe
                      ? `${selectedCafe.display_name} (${selectedCafe.slug})`
                      : 'اختر قهوة أولًا'}
                  </div>
                </div>
                {selectedCafe ? (
                  <button
                    disabled={busy}
                    onClick={() => submitToggleCafe(!selectedCafe.is_active)}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium text-white ${
                      selectedCafe.is_active ? 'bg-rose-600' : 'bg-emerald-600'
                    } disabled:opacity-60`}
                  >
                    {selectedCafe.is_active ? 'تعطيل القهوة' : 'تفعيل القهوة'}
                  </button>
                ) : null}
              </div>

              {selectedCafe ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">الحالة التشغيلية</div>
                    <div className="mt-2 text-lg font-semibold">
                      {selectedCafe.is_active ? 'مفعلة' : 'معطلة'}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      أُنشئت في {formatDateTime(selectedCafe.created_at)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">الاشتراك الحالي</div>
                    {currentSubscription ? (
                      <>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${subscriptionBadgeClass(
                              currentSubscription.effective_status,
                            )}`}
                          >
                            {currentSubscription.effective_status}
                          </span>
                          <span className="text-sm text-slate-600">
                            حتى {formatDateTime(currentSubscription.ends_at)}
                          </span>
                        </div>
                        <div className="mt-2 text-sm font-medium text-slate-800">
                          العد التنازلي: {countdownLabel(currentSubscription.countdown_seconds)}
                        </div>
                        {currentSubscription.notes ? (
                          <div className="mt-2 text-xs text-slate-500">
                            {currentSubscription.notes}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">لا يوجد اشتراك مسجل</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">إضافة مالك أو شريك</h2>
                <div className="mt-4 space-y-3">
                  <select
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    value={createOwner.ownerLabel}
                    onChange={(e) =>
                      setCreateOwner((v) => ({
                        ...v,
                        ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner',
                      }))
                    }
                  >
                    <option value="partner">شريك</option>
                    <option value="owner">مالك</option>
                  </select>
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    placeholder="الاسم"
                    value={createOwner.fullName}
                    onChange={(e) =>
                      setCreateOwner((v) => ({ ...v, fullName: e.target.value }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    placeholder="رقم الهاتف"
                    value={createOwner.phone}
                    onChange={(e) =>
                      setCreateOwner((v) => ({ ...v, phone: e.target.value }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    type="password"
                    placeholder="الباسورد"
                    value={createOwner.password}
                    onChange={(e) =>
                      setCreateOwner((v) => ({ ...v, password: e.target.value }))
                    }
                  />
                  <button
                    disabled={busy || !selectedCafeId}
                    onClick={submitCreateOwner}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
                  >
                    حفظ الحساب
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">تعديل الحساب المختار</h2>
                <div className="mt-4 space-y-3">
                  <select
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    value={editOwner.ownerUserId}
                    onChange={(e) => {
                      const selected = owners.find(
                        (owner) => owner.owner_user_id === e.target.value,
                      );
                      if (!selected) {
                        setEditOwner({
                          ownerUserId: '',
                          fullName: '',
                          phone: '',
                          ownerLabel: 'partner',
                        });
                        return;
                      }

                      setEditOwner({
                        ownerUserId: selected.owner_user_id,
                        fullName: selected.full_name,
                        phone: selected.phone,
                        ownerLabel: selected.owner_label,
                      });
                    }}
                  >
                    <option value="">اختر حسابًا</option>
                    {owners.map((owner) => (
                      <option key={owner.owner_user_id} value={owner.owner_user_id}>
                        {owner.full_name} — {owner.owner_label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    placeholder="الاسم"
                    value={editOwner.fullName}
                    onChange={(e) =>
                      setEditOwner((v) => ({ ...v, fullName: e.target.value }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    placeholder="رقم الهاتف"
                    value={editOwner.phone}
                    onChange={(e) =>
                      setEditOwner((v) => ({ ...v, phone: e.target.value }))
                    }
                  />
                  <select
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    value={editOwner.ownerLabel}
                    onChange={(e) =>
                      setEditOwner((v) => ({
                        ...v,
                        ownerLabel: e.target.value === 'owner' ? 'owner' : 'partner',
                      }))
                    }
                  >
                    <option value="owner">مالك</option>
                    <option value="partner">شريك</option>
                  </select>
                  <button
                    disabled={busy || !selectedCafeId || !editOwner.ownerUserId}
                    onClick={submitUpdateOwner}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
                  >
                    تحديث الحساب
                  </button>
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">الحسابات المرتبطة بالقهوة</h2>
                <div className="mt-4 space-y-3">
                  {owners.map((owner) => (
                    <div
                      key={owner.owner_user_id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold">{owner.full_name}</div>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                              {owner.owner_label === 'owner' ? 'مالك' : 'شريك'}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-1 text-[11px] ${statusBadgeClass(
                                owner.is_active,
                              )}`}
                            >
                              {owner.is_active ? 'نشط' : 'معطل'}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-slate-600">{owner.phone}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            أُنشئ في {formatDateTime(owner.created_at)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              setResetPassword((v) => ({
                                ...v,
                                ownerUserId: owner.owner_user_id,
                              }))
                            }
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          >
                            اختيار للباسورد
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => submitToggleOwner(owner, !owner.is_active)}
                            className={`rounded-xl px-3 py-2 text-sm text-white ${
                              owner.is_active ? 'bg-rose-600' : 'bg-emerald-600'
                            } disabled:opacity-60`}
                          >
                            {owner.is_active ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {owners.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      لا توجد حسابات لهذه القهوة
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold">تغيير الباسورد</h2>
                  <div className="mt-4 space-y-3">
                    <select
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                      value={resetPassword.ownerUserId}
                      onChange={(e) =>
                        setResetPassword((v) => ({
                          ...v,
                          ownerUserId: e.target.value,
                        }))
                      }
                    >
                      <option value="">اختر الحساب</option>
                      {owners.map((owner) => (
                        <option key={owner.owner_user_id} value={owner.owner_user_id}>
                          {owner.full_name} — {owner.phone}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                      type="password"
                      placeholder="الباسورد الجديد"
                      value={resetPassword.newPassword}
                      onChange={(e) =>
                        setResetPassword((v) => ({
                          ...v,
                          newPassword: e.target.value,
                        }))
                      }
                    />
                    <button
                      disabled={
                        busy ||
                        !selectedCafeId ||
                        !resetPassword.ownerUserId ||
                        !resetPassword.newPassword
                      }
                      onClick={submitResetOwnerPassword}
                      className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
                    >
                      تحديث الباسورد
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold">منح دعم فني</h2>
                  <div className="mt-4 space-y-3">
                    <textarea
                      className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3"
                      placeholder="ملاحظات صلاحية الدعم"
                      value={supportNotes}
                      onChange={(e) => setSupportNotes(e.target.value)}
                    />
                    <button
                      disabled={busy || !selectedCafeId}
                      onClick={submitGrantSupport}
                      className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
                    >
                      منح الصلاحية
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">إدارة الاشتراك اليدوي</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applySubscriptionPreset(30, 'trial')}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    شهر مجاني
                  </button>
                  <button
                    type="button"
                    onClick={() => applySubscriptionPreset(365, 'active')}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    سنة كاملة
                  </button>
                  <button
                    type="button"
                    onClick={() => applySubscriptionPreset(30, 'suspended')}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    تعليق 30 يوم
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      type="date"
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                      value={subscriptionForm.startsAt}
                      onChange={(e) =>
                        setSubscriptionForm((v) => ({ ...v, startsAt: e.target.value }))
                      }
                    />
                    <input
                      type="date"
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                      value={subscriptionForm.endsAt}
                      onChange={(e) =>
                        setSubscriptionForm((v) => ({ ...v, endsAt: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                      inputMode="numeric"
                      placeholder="أيام السماح"
                      value={subscriptionForm.graceDays}
                      onChange={(e) =>
                        setSubscriptionForm((v) => ({ ...v, graceDays: e.target.value }))
                      }
                    />
                    <select
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                      value={subscriptionForm.status}
                      onChange={(e) =>
                        setSubscriptionForm((v) => ({
                          ...v,
                          status: e.target.value as SubscriptionStatus,
                        }))
                      }
                    >
                      <option value="trial">trial</option>
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                      <option value="expired">expired</option>
                    </select>
                  </div>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3"
                    placeholder="ملاحظات الاشتراك"
                    value={subscriptionForm.notes}
                    onChange={(e) =>
                      setSubscriptionForm((v) => ({ ...v, notes: e.target.value }))
                    }
                  />
                  <button
                    disabled={busy || !selectedCafeId}
                    onClick={submitSubscription}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
                  >
                    حفظ الاشتراك
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">سجل الاشتراكات</h2>
                <div className="mt-4 space-y-3">
                  {subscriptions.map((subscription) => (
                    <div
                      key={subscription.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs ${subscriptionBadgeClass(
                            subscription.effective_status,
                          )}`}
                        >
                          {subscription.effective_status}
                        </span>
                        <span className="text-sm text-slate-600">
                          من {formatDateTime(subscription.starts_at)} إلى{' '}
                          {formatDateTime(subscription.ends_at)}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        أيام السماح: {subscription.grace_days}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">
                        العد التنازلي: {countdownLabel(subscription.countdown_seconds)}
                      </div>
                      {subscription.notes ? (
                        <div className="mt-2 text-sm text-slate-500">
                          {subscription.notes}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {subscriptions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      لا يوجد سجل اشتراكات بعد
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
