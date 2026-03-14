'use client';

import { useState } from 'react';
import type { ComplaintRecord } from '@/lib/ops/types';

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
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">ملاحظة أو شكوى على الجلسة</div>
          <div className="mt-1 text-xs text-slate-500">{sessionLabel || 'الجلسة الحالية'} • تُحفظ في التقارير والسناب شوت</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={[
            'shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold',
            open ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700',
          ].join(' ')}
        >
          {open ? 'إغلاق' : 'إضافة ملاحظة'}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <select
            value={complaintKind}
            onChange={(event) => setComplaintKind(event.target.value as ComplaintRecord['complaintKind'])}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right"
          >
            <option value="quality_issue">جودة</option>
            <option value="wrong_item">صنف خطأ</option>
            <option value="delay">تأخير</option>
            <option value="billing_issue">حساب</option>
            <option value="other">أخرى</option>
          </select>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="اكتب الملاحظة أو الشكوى العامة للجلسة"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNotes('');
                setOpen(false);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={busy || !notes.trim()}
              onClick={() => void submit()}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? '...' : 'حفظ الملاحظة'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
