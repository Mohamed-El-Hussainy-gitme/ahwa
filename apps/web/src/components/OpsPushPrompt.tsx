'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getOpsPushPermissionState,
  requestOpsPushPermissionAndSync,
  syncOpsPushSubscription,
  type EligiblePushRole,
  type OpsPushPermissionState,
} from '@/lib/pwa/push-client';
import { enableOpsNotificationAudio, playOpsNotificationSignal } from '@/lib/ops/notifications';

type OpsPushPromptProps = {
  enabled: boolean;
  role: EligiblePushRole | null;
  shiftId: string | null;
};

function readDismissed(key: string) {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {}
}

export default function OpsPushPrompt({ enabled, role, shiftId }: OpsPushPromptProps) {
  const promptKey = useMemo(() => `ahwa:ops:push-prompt:${shiftId ?? 'none'}:${role ?? 'none'}`, [role, shiftId]);
  const [permission, setPermission] = useState<OpsPushPermissionState>('unsupported');
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(getOpsPushPermissionState());
    setDismissed(readDismissed(promptKey));
  }, [promptKey]);

  useEffect(() => {
    if (!enabled || !role || !shiftId) {
      return;
    }
    if (permission !== 'granted') {
      return;
    }
    void syncOpsPushSubscription({ enabled, role, shiftId });
  }, [enabled, permission, role, shiftId]);

  if (!enabled || !role || !shiftId) {
    return null;
  }

  if (permission !== 'default' || dismissed) {
    return null;
  }

  const handleEnable = async () => {
    setBusy(true);
    try {
      await enableOpsNotificationAudio();
      const nextPermission = await requestOpsPushPermissionAndSync({ enabled, role, shiftId });
      setPermission(nextPermission);
      if (nextPermission === 'granted') {
        await playOpsNotificationSignal('station-order');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    writeDismissed(promptKey);
    setDismissed(true);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4" dir="rtl">
      <div className="pointer-events-auto w-full max-w-md rounded-[28px] border border-amber-200 bg-[#fff8ef] p-4 shadow-[0_20px_60px_rgba(43,23,16,0.16)]">
        <div className="text-sm font-bold text-[#2b1710]">فعّل تنبيهات التشغيل على هذا الجهاز</div>
        <p className="mt-1 text-xs leading-6 text-[#6b5a4c]">
          التفعيل من هنا يجعل إشعارات الـ PWA تعمل بشكل ثابت لهذا الدور أثناء الشفت الحالي، مع اختبار صوت فوري داخل التطبيق.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="flex-1 rounded-2xl bg-[#2b1710] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'جارٍ التفعيل...' : 'تفعيل التنبيهات'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            className="rounded-2xl border border-[#d9cabb] bg-white px-4 py-3 text-sm font-medium text-[#6b5a4c] disabled:opacity-60"
          >
            لاحقًا
          </button>
        </div>
      </div>
    </div>
  );
}
