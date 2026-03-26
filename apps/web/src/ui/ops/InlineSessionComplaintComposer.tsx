'use client';

import { useState } from 'react';
import type { ComplaintRecord } from '@/lib/ops/types';
import {
  opsAccentButton,
  opsBadge,
  opsEmptyState,
  opsGhostButton,
  opsInput,
  opsSelect,
  opsSurfaceMuted,
} from '@/ui/ops/premiumStyles';

type Props = {
  sessionId: string;
  sessionLabel: string;
  busy?: boolean;
  onSubmit: (input: {
    serviceSessionId: string;
    complaintKind: ComplaintRecord['complaintKind'];
    notes: string;
  }) => Promise<void> | void;
};

export function InlineSessionComplaintComposer({ sessionId, sessionLabel, busy = false, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [complaintKind, setComplaintKind] = useState<ComplaintRecord['complaintKind']>('other');
  const [notes, setNotes] = useState('');

  async function submit() {
    const normalized = notes.trim();
    if (!sessionId || !normalized) return;
    await onSubmit({ serviceSessionId: sessionId, complaintKind, notes: normalized });
    setNotes('');
    setComplaintKind('other');
    setOpen(false);
  }

  if (!sessionId) return null;

  return (
    <div className={`mt-3 ${opsSurfaceMuted} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-[#1e1712]">ملاحظة تشغيلية على الجلسة</div>
          <div className="mt-1 text-xs leading-6 text-[#7d6a59]">{sessionLabel || 'الجلسة الحالية'} • تُحفظ ضمن السجل والتقارير التشغيلية</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={open ? opsAccentButton : opsGhostButton}
        >
          {open ? 'إغلاق' : 'إضافة ملاحظة'}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className={opsBadge('accent')}>جلسة نشطة</span>
            <span className={opsBadge('info')}>{sessionLabel || 'بدون اسم'}</span>
          </div>
          <select
            value={complaintKind}
            onChange={(event) => setComplaintKind(event.target.value as ComplaintRecord['complaintKind'])}
            className={opsSelect}
          >
            <option value="quality_issue">جودة</option>
            <option value="wrong_item">صنف غير مطابق</option>
            <option value="delay">تأخير</option>
            <option value="billing_issue">حساب</option>
            <option value="other">أخرى</option>
          </select>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="اكتب الملاحظة أو البلاغ التشغيلي بوضوح"
            className={opsInput}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNotes('');
                setOpen(false);
              }}
              className={opsGhostButton}
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={busy || !notes.trim()}
              onClick={() => void submit()}
              className={opsAccentButton}
            >
              {busy ? 'جارٍ الحفظ...' : 'حفظ الملاحظة'}
            </button>
          </div>
        </div>
      ) : (
        <div className={`mt-3 ${opsEmptyState()} text-xs`}>
          أضف ملاحظة عندما تحتاج توثيق جودة الخدمة أو أي متابعة مرتبطة بهذه الجلسة.
        </div>
      )}
    </div>
  );
}
