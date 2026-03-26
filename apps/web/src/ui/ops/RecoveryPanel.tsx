'use client';

import { useCallback, useEffect, useState } from 'react';
import { extractApiErrorMessage } from '@/lib/api/errors';
import { resolveMessage } from '@/lib/messages/catalog';
import { opsBadge, opsDashed, opsGhostButton, opsInset, opsSurface } from '@/ui/ops/premiumStyles';

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
    <details className={[opsSurface, 'mt-4 p-4'].join(' ')}>
      <summary className="cursor-pointer list-none text-right font-bold text-[#1e1712]">
        الاسترداد والطوارئ
      </summary>

      <div className="mt-3 space-y-3 text-right">
        <p className="text-xs leading-6 text-[#7d6a59]">
          هذا القسم مخفي افتراضيًا ويُستخدم فقط عند تعطل حالة محلية أو وجود جلسة قابلة للإغلاق الآمن أو أقفال طلبات عالقة.
        </p>

        {message ? (
          <div className={[opsInset, 'p-3 text-sm text-[#5e4d3f]'].join(' ')}>{message}</div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleResync}
            disabled={busy}
            className={[opsGhostButton, 'disabled:opacity-50'].join(' ')}
          >
            {busy ? '...' : 'إعادة مزامنة الحالة'}
          </button>
          <button
            type="button"
            onClick={handleReleaseLocks}
            disabled={busy}
            className="rounded-[18px] border border-[#ecd9bd] bg-[#fcf3e7] px-4 py-3 text-sm font-semibold text-[#a5671e] disabled:opacity-50"
          >
            {busy ? '...' : `تحرير الأقفال العالقة (${state?.staleLocksCount ?? 0})`}
          </button>
        </div>

        <div className={[opsInset, 'p-3'].join(' ')}>
          <div className="text-sm font-semibold text-[#1e1712]">جلسات قابلة للاسترداد الآمن</div>
          <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
            الجلسة القابلة للاسترداد هي جلسة مفتوحة لا تحتوي انتظار تحضير ولا جاهز غير مُسلّم ولا بنود قابلة للحساب.
          </div>

          <div className="mt-3 space-y-2">
            {state?.recoverableSessions?.length ? state.recoverableSessions.map((session) => (
              <div key={session.id} className={[opsInset, 'p-3'].join(' ')}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleCloseSession(session.id)}
                    disabled={busy}
                    className="rounded-[16px] border border-[#e6c7c2] bg-[#fff3f1] px-3 py-2 text-xs font-semibold text-[#9a3e35] disabled:opacity-50"
                  >
                    إغلاق آمن
                  </button>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#1e1712]">{session.label}</div>
                    <div className="mt-1 text-xs text-[#7d6a59]">
                      مفتوحة منذ {session.ageMinutes} د • {formatDateTime(session.openedAt)}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className={[opsDashed, 'p-3 text-xs text-[#7d6a59]'].join(' ')}>
                لا توجد جلسات قابلة للاسترداد الآمن الآن.
              </div>
            )}
          </div>
        </div>

        <div className={[opsInset, 'p-3'].join(' ')}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[#1e1712]">الأقفال العالقة</div>
            <span className={opsBadge('warning')}>{state?.staleLocksCount ?? 0}</span>
          </div>
          <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
            تظهر هنا فقط طلبات حساسة ظلت في حالة pending أكثر من دقيقتين.
          </div>
          <div className="mt-3 space-y-2">
            {state?.staleLocks?.length ? state.staleLocks.map((lock) => (
              <div key={lock.key} className={[opsInset, 'p-3 text-xs text-[#6b5a4c]'].join(' ')}>
                <div className="font-semibold text-[#1e1712]">{lock.actionName}</div>
                <div className="mt-1">منذ {lock.ageSeconds} ث</div>
                <div className="mt-1 break-all text-[11px] text-[#8b7866]">{lock.key}</div>
              </div>
            )) : (
              <div className={[opsDashed, 'p-3 text-xs text-[#7d6a59]'].join(' ')}>
                لا توجد أقفال عالقة حاليًا.
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
