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
type OwnerLabel = 'owner' | 'partner' | 'branch_manager';

type StaffRow = {
  id: string;
  fullName: string | null;
  employeeCode: string | null;
  accountKind: string;
  isActive: boolean;
  employmentStatus: StaffEmploymentStatus;
  createdAt: string;
};

type ManagementRow = {
  id: string;
  fullName: string | null;
  phone: string | null;
  ownerLabel: OwnerLabel;
  isActive: boolean;
  createdAt: string;
};

function statusLabel(status: StaffEmploymentStatus) {
  switch (status) {
    case 'active': return 'فعال';
    case 'inactive': return 'موقوف مؤقتًا';
    case 'left': return 'غادر';
  }
}

function statusTone(status: StaffEmploymentStatus) {
  switch (status) {
    case 'active': return opsBadge('success');
    case 'inactive': return opsBadge('warning');
    case 'left': return opsBadge('neutral');
  }
}

function ownerLabelText(label: OwnerLabel) {
  if (label === 'branch_manager') return 'مدير الفرع';
  if (label === 'partner') return 'شريك';
  return 'مالك';
}

export default function StaffPage() {
  const { can } = useAuthz();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [management, setManagement] = useState<ManagementRow[]>([]);
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerRole, setManagerRole] = useState<'partner' | 'branch_manager'>('branch_manager');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'left' | 'all'>('active');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setMsg(null);
    const [staffRes, managementRes] = await Promise.all([
      fetch('/api/owner/staff/list', { cache: 'no-store' }),
      fetch('/api/owner/management/list', { cache: 'no-store' }),
    ]);
    const staffJson = await staffRes.json().catch(() => null);
    const managementJson = await managementRes.json().catch(() => null);

    if (!staffJson?.ok) {
      setStaff([]);
      setMsg(extractApiErrorMessage(staffJson, 'FAILED_TO_LOAD_STAFF'));
      return;
    }
    setStaff(staffJson.staff as StaffRow[]);
    setManagement(Array.isArray(managementJson?.accounts) ? managementJson.accounts as ManagementRow[] : []);
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

  async function createManagement() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/owner/management/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName: managerName, phone: managerPhone, password: managerPassword, ownerLabel: managerRole }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(extractApiErrorMessage(json, 'MANAGEMENT_CREATE_FAILED'));
        return;
      }
      setManagerName('');
      setManagerPhone('');
      setManagerPassword('');
      setManagerRole('branch_manager');
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

  if (!can.manageStaff) {
    return <MobileShell title="فريق العمل" backHref="/owner"><div className="text-right text-sm">غير مصرح.</div></MobileShell>;
  }

  return (
    <MobileShell title="فريق العمل" backHref="/owner">
      <section className={[opsSurface, 'p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-base font-bold text-[#1e1712]">إضافة عضو للفريق</div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">إنشاء حسابات التشغيل اليومية بدون المساس ببنية النظام.</div>
          </div>
          <div className={opsBadge('accent')}>التشغيل</div>
        </div>

        {msg ? <div className="mt-3 rounded-[20px] border border-[#e6c7c2] bg-[#fff7f5] p-3 text-right text-sm text-[#9a3e35]">{msg}</div> : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input className={opsInput} placeholder="PIN" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          <input className={opsInput} placeholder="كود الموظف" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          <input className={opsInput} placeholder="الاسم للتسجيل" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <button disabled={busy || !name.trim() || !pin.trim() || !employeeCode.trim()} onClick={createStaff} className={[opsAccentButton, 'mt-3 w-full'].join(' ')}>
          {busy ? '...' : 'إضافة عضو'}
        </button>
      </section>

      {can.owner ? (
        <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-right">
              <div className="text-base font-bold text-[#1e1712]">الحسابات الإدارية</div>
              <div className="mt-1 text-xs leading-6 text-[#7d6a59]">إنشاء مدير فرع أو شريك يدخل من شاشة المالك بصلاحيات مضبوطة.</div>
            </div>
            <div className={opsBadge('info')}>الإدارة</div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className={opsInput} placeholder="الاسم" value={managerName} onChange={(e) => setManagerName(e.target.value)} />
            <input className={opsInput} placeholder="رقم الهاتف" value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} />
            <input className={opsInput} placeholder="كلمة المرور" type="password" value={managerPassword} onChange={(e) => setManagerPassword(e.target.value)} />
            <select className={opsInput} value={managerRole} onChange={(e) => setManagerRole(e.target.value === 'partner' ? 'partner' : 'branch_manager')}>
              <option value="branch_manager">مدير الفرع</option>
              <option value="partner">شريك</option>
            </select>
          </div>

          <button disabled={busy || !managerName.trim() || !managerPhone.trim() || !managerPassword.trim()} onClick={createManagement} className={[opsAccentButton, 'mt-3 w-full'].join(' ')}>
            {busy ? '...' : 'إضافة حساب إداري'}
          </button>

          <div className="mt-3 space-y-2">
            {management.map((item) => (
              <div key={item.id} className={[opsInset, 'p-3 text-right'].join(' ')}>
                <div className="flex items-center justify-between gap-2">
                  <span className={opsBadge(item.ownerLabel === 'branch_manager' ? 'warning' : 'neutral')}>{ownerLabelText(item.ownerLabel)}</span>
                  <div className="font-semibold text-[#1e1712]">{item.fullName ?? item.phone ?? item.id}</div>
                </div>
                {item.phone ? <div className="mt-1 text-xs text-[#7d6a59]">{item.phone}</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={refresh} className={opsGhostButton}>تحديث</button>
          <div className="text-right font-bold text-[#1e1712]">قائمة الفريق</div>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {[
            { key: 'active', label: 'النشطون' },
            { key: 'inactive', label: 'الموقوفون' },
            { key: 'left', label: 'غادروا' },
            { key: 'all', label: 'الكل' },
          ].map((filter) => (
            <button key={filter.key} type="button" onClick={() => setStatusFilter(filter.key as 'active' | 'inactive' | 'left' | 'all')} className={[
              'rounded-full border px-3 py-1 text-xs font-semibold',
              statusFilter === filter.key ? 'border-[#1e1712] bg-[#1e1712] text-white' : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
            ].join(' ')}>
              {filter.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {visibleStaff.map((s) => (
            <div key={s.id} className={[opsInset, 'p-3'].join(' ')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-2">
                  <button disabled={busy} onClick={() => resetPin(s.id)} className={[opsGhostButton, 'disabled:opacity-50'].join(' ')}>تغيير PIN</button>
                  <button disabled={busy} onClick={() => void setEmploymentStatus(s.id, s.employmentStatus === 'active' ? 'inactive' : 'active')} className={[
                    'rounded-[18px] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50',
                    s.employmentStatus === 'active' ? 'bg-[#9b6b2e]' : 'bg-[#2e6a4e]',
                  ].join(' ')}>
                    {s.employmentStatus === 'active' ? 'إيقاف مؤقت' : 'تفعيل'}
                  </button>
                  {s.employmentStatus !== 'left' ? <button disabled={busy} onClick={() => void setEmploymentStatus(s.id, 'left')} className="rounded-[18px] bg-[#7c5222] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">غادر</button> : null}
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className={statusTone(s.employmentStatus)}>{statusLabel(s.employmentStatus)}</span>
                    <div className="font-semibold text-[#1e1712]">{s.fullName ?? s.employeeCode ?? s.id}</div>
                  </div>
                  <div className="mt-1 text-xs text-[#7d6a59]">الدور الأساسي: <b>عضو فريق</b></div>
                  {s.employeeCode ? <div className="mt-1 text-[11px] text-[#8b7866]">كود الموظف: {s.employeeCode}</div> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}
