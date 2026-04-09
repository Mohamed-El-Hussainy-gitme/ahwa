'use client';

import { useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { extractApiErrorMessage } from '@/lib/api/errors';
import {
  opsAccentButton,
  opsBadge,
  opsGhostButton,
  opsInput,
  opsInset,
  opsSurface,
} from '@/ui/ops/premiumStyles';

type StaffEmploymentStatus = 'active' | 'inactive' | 'left';

type StaffRow = {
  id: string;
  fullName: string | null;
  employeeCode: string | null;
  accountKind: string;
  isActive: boolean;
  employmentStatus: StaffEmploymentStatus;
  createdAt: string;
};

function statusLabel(status: StaffEmploymentStatus) {
  switch (status) {
    case 'active':
      return 'فعال';
    case 'inactive':
      return 'موقوف مؤقتًا';
    case 'left':
      return 'غادر';
  }
}

function statusTone(status: StaffEmploymentStatus) {
  switch (status) {
    case 'active':
      return opsBadge('success');
    case 'inactive':
      return opsBadge('warning');
    case 'left':
      return opsBadge('neutral');
  }
}

export default function StaffPage() {
  const { can } = useAuthz();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'left' | 'all'>('active');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setMsg(null);
    const res = await fetch('/api/owner/staff/list', { cache: 'no-store' });
    const json = await res.json().catch(() => null);

    if (!json?.ok) {
      setStaff([]);
      setMsg(extractApiErrorMessage(json, 'FAILED_TO_LOAD_STAFF'));
      return;
    }
    setStaff(json.staff as StaffRow[]);
  }

  useEffect(() => {
    if (!can.manageStaff) return;
    void refresh();
  }, [can.manageStaff]);

  async function createStaff() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/owner/staff/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, pin, employeeCode }),
      });
      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        setMsg(extractApiErrorMessage(json, 'STAFF_CREATE_FAILED'));
        return;
      }

      setName('');
      setPin('');
      setEmployeeCode('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setEmploymentStatus(userId: string, employmentStatus: StaffEmploymentStatus) {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/owner/staff/set-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, employmentStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(extractApiErrorMessage(json, 'STATUS_UPDATE_FAILED'));
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resetPin(userId: string) {
    const next = prompt('اكتب PIN جديد (4 أرقام أو أكثر):')?.trim() ?? '';
    if (!next) return;
    if (next.length < 4) {
      alert('PIN قصير');
      return;
    }

    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/owner/staff/set-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, pin: next }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(extractApiErrorMessage(json, 'PIN_RESET_FAILED'));
        return;
      }
      alert('تم تحديث الـ PIN. يجب على عضو الفريق تسجيل الدخول من جديد.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const visibleStaff = useMemo(
    () => staff.filter((item) => (statusFilter === 'all' ? true : item.employmentStatus === statusFilter)),
    [staff, statusFilter],
  );

  return (
    <MobileShell title="فريق العمل" backHref="/owner">
      <section className={[opsSurface, 'p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-base font-bold text-[#1e1712]">إضافة عضو للفريق</div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
              أنشئ حسابات الفريق بصياغة واضحة: اسم التسجيل، رمز الدخول، وكود الموظف الظاهر في التشغيل.
            </div>
          </div>
          <div className={opsBadge('accent')}>الإدارة</div>
        </div>

        {msg ? (
          <div className="mt-3 rounded-[20px] border border-[#e6c7c2] bg-[#fff7f5] p-3 text-right text-sm text-[#9a3e35]">
            {msg}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input className={opsInput} placeholder="PIN" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          <input className={opsInput} placeholder="كود الموظف" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          <input className={opsInput} placeholder="الاسم للتسجيل" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <button
          disabled={busy || !name.trim() || !pin.trim() || !employeeCode.trim()}
          onClick={createStaff}
          className={[opsAccentButton, 'mt-3 w-full'].join(' ')}
        >
          {busy ? '...' : 'إضافة عضو'}
        </button>

        <div className="mt-2 text-right text-xs leading-6 text-[#7d6a59]">
          تسجيل دخول عضو الفريق: يدخل <b>اسمه أو كوده</b> + <b>PIN</b> داخل شاشة القهوة.
        </div>
      </section>

      <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={refresh} className={opsGhostButton}>
            تحديث
          </button>
          <div className="text-right font-bold text-[#1e1712]">قائمة الفريق</div>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {[
            { key: 'active', label: 'النشطون' },
            { key: 'inactive', label: 'الموقوفون' },
            { key: 'left', label: 'غادروا' },
            { key: 'all', label: 'الكل' },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key as 'active' | 'inactive' | 'left' | 'all')}
              className={[
                'rounded-full border px-3 py-1 text-xs font-semibold',
                statusFilter === filter.key
                  ? 'border-[#1e1712] bg-[#1e1712] text-white'
                  : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
              ].join(' ')}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="mt-3 text-right text-xs leading-6 text-[#7d6a59]">
          القائمة اليومية تبدأ بالنشطين فقط حتى تبقى الإدارة أخف، ويمكن إظهار الموقوفين أو من غادروا عند المراجعة.
        </div>

        {visibleStaff.length === 0 ? (
          <div className="mt-3 text-right text-sm text-[#7d6a59]">لا يوجد أعضاء في هذا التصنيف.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {visibleStaff.map((s) => {
              const display = s.fullName ?? s.employeeCode ?? s.id;
              const isOwner = s.accountKind === 'owner';
              return (
                <div key={s.id} className={[opsInset, 'p-3'].join(' ')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-2">
                      {!isOwner ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => resetPin(s.id)}
                            className={[opsGhostButton, 'disabled:opacity-50'].join(' ')}
                          >
                            تغيير PIN
                          </button>

                          <button
                            disabled={busy}
                            onClick={() => void setEmploymentStatus(s.id, s.employmentStatus === 'active' ? 'inactive' : 'active')}
                            className={[
                              'rounded-[18px] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50',
                              s.employmentStatus === 'active' ? 'bg-[#9b6b2e]' : 'bg-[#2e6a4e]',
                            ].join(' ')}
                          >
                            {s.employmentStatus === 'active' ? 'إيقاف مؤقت' : 'تفعيل'}
                          </button>

                          {s.employmentStatus !== 'left' ? (
                            <button
                              disabled={busy}
                              onClick={() => void setEmploymentStatus(s.id, 'left')}
                              className="rounded-[18px] bg-[#7c5222] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              غادر
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <div className="text-[11px] leading-6 text-[#7d6a59]">(لا يمكن تعديل حساب المالك هنا)</div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={statusTone(s.employmentStatus)}>{statusLabel(s.employmentStatus)}</span>
                        <div className="font-semibold text-[#1e1712]">{display}</div>
                      </div>
                      <div className="mt-1 text-xs text-[#7d6a59]">
                        الدور الأساسي: <b>{isOwner ? 'مالك' : 'عضو فريق'}</b>
                      </div>
                      {s.employeeCode ? <div className="mt-1 text-[11px] text-[#8b7866]">كود الموظف: {s.employeeCode}</div> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </MobileShell>
  );
}
