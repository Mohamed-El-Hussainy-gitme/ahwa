'use client';

import { useCallback, useEffect, useState } from 'react';
import { extractApiErrorMessage } from '@/lib/api/errors';
import { resolveMessage } from '@/lib/messages/catalog';

type RecoverySessionSummary = {
  id: string;
  label: string;
  openedAt: string | null;
  ageMinutes: number;
  waitingQty: number;
  readyQty: number;
  billableQty: number;
  recoverable: boolean;
};

type RecoveryState = {
  openShiftId: string | null;
  openSessionsCount: number;
  recoverableSessions: RecoverySessionSummary[];
  staleLocksCount: number;
  staleLocks: Array<{
    key: string;
    actionName: string;
    createdAt: string | null;
    ageSeconds: number;
  }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString('ar-EG');
}

export function RecoveryPanel({ onResync }: { onResync: () => Promise<void> }) {
  const [state, setState] = useState<RecoveryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const res = await fetch('/api/owner/recovery/state', { cache: 'no-store' });
    const json = await res.json().catch(() => null);
    if (!json?.ok) {
      throw new Error(extractApiErrorMessage(json, 'RECOVERY_STATE_FAILED'));
    }
    setState((json.recovery as RecoveryState) ?? null);
  }, []);

  useEffect(() => {
    void loadState().catch((error) => {
      setMessage(error instanceof Error ? error.message : resolveMessage('RECOVERY_STATE_FAILED'));
    });
  }, [loadState]);

  async function handleResync() {
    setBusy(true);
    setMessage(null);
    try {
      await onResync();
      await loadState();
      setMessage(resolveMessage('RECOVERY_RESYNC_COMPLETE'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : resolveMessage('RECOVERY_STATE_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  async function handleReleaseLocks() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/recovery/release-stale-locks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        throw new Error(extractApiErrorMessage(json, 'RECOVERY_RELEASE_LOCKS_FAILED'));
      }
      await loadState();
      setMessage(resolveMessage(typeof json.code === 'string' ? json.code : 'RECOVERY_LOCKS_RELEASED'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : resolveMessage('RECOVERY_RELEASE_LOCKS_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseSession(sessionId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/recovery/close-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceSessionId: sessionId }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        throw new Error(extractApiErrorMessage(json, 'RECOVERY_CLOSE_SESSION_FAILED'));
      }
      await onResync();
      await loadState();
      setMessage(resolveMessage(typeof json.code === 'string' ? json.code : 'RECOVERY_SESSION_CLOSED'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : resolveMessage('RECOVERY_CLOSE_SESSION_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer list-none text-right font-bold text-slate-900">
        الاسترداد والطوارئ
      </summary>

      <div className="mt-3 space-y-3 text-right">
        <p className="text-xs text-slate-500">
          هذا القسم مخفي افتراضيًا ويُستخدم فقط عند تعطل حالة محلية أو وجود جلسة قابلة للإغلاق الآمن أو أقفال طلبات عالقة.
        </p>

        {message ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{message}</div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleResync}
            disabled={busy}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {busy ? '...' : 'إعادة مزامنة الحالة'}
          </button>
          <button
            type="button"
            onClick={handleReleaseLocks}
            disabled={busy}
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 disabled:opacity-50"
          >
            {busy ? '...' : `تحرير الأقفال العالقة (${state?.staleLocksCount ?? 0})`}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">جلسات قابلة للاسترداد الآمن</div>
          <div className="mt-1 text-xs text-slate-500">
            الجلسة القابلة للاسترداد هي جلسة مفتوحة لا تحتوي انتظار تحضير ولا جاهز غير مُسلّم ولا بنود قابلة للحساب.
          </div>

          <div className="mt-3 space-y-2">
            {state?.recoverableSessions?.length ? state.recoverableSessions.map((session) => (
              <div key={session.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleCloseSession(session.id)}
                    disabled={busy}
                    className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    إغلاق آمن
                  </button>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900">{session.label}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      مفتوحة منذ {session.ageMinutes} د • {formatDateTime(session.openedAt)}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                لا توجد جلسات قابلة للاسترداد الآمن الآن.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">الأقفال العالقة</div>
          <div className="mt-1 text-xs text-slate-500">
            تظهر هنا فقط طلبات حساسة ظلت في حالة pending أكثر من دقيقتين.
          </div>
          <div className="mt-3 space-y-2">
            {state?.staleLocks?.length ? state.staleLocks.map((lock) => (
              <div key={lock.key} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <div className="font-semibold text-slate-900">{lock.actionName}</div>
                <div className="mt-1">منذ {lock.ageSeconds} ث</div>
                <div className="mt-1 break-all text-[11px] text-slate-500">{lock.key}</div>
              </div>
            )) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                لا توجد أقفال عالقة حاليًا.
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
