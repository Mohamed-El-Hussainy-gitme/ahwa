"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function ActivateClient({ cafeSlug }: { cafeSlug: string }) {
  const r = useRouter();
  const [pairingCode, setPairingCode] = useState('');
  const [label, setLabel] = useState('هاتف التشغيل');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const platformName = useMemo(() => typeof navigator !== 'undefined' ? navigator.platform : 'web', []);
  const browserName = useMemo(() => typeof navigator !== 'undefined' ? navigator.userAgent : 'browser', []);

  async function activate() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/device-gate/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: cafeSlug, pairingCode, label, deviceType: 'mobile_phone', deviceMode: 'shared_runtime', platformName, browserName, appVersion: 'phase-16' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setErr(j?.error?.code || j?.error?.message || 'DEVICE_ACTIVATION_FAILED');
        return;
      }
      r.replace(`/c/${encodeURIComponent(cafeSlug)}/login`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-amber-50 to-slate-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm">
        <div className="text-xl font-semibold text-neutral-900">تفعيل الجهاز</div>
        <div className="mt-1 text-sm text-neutral-500">قهوة: {cafeSlug}</div>
        <div className="mt-4 space-y-2">
          <input className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right" placeholder="اسم الجهاز" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right" placeholder="Pairing code" value={pairingCode} onChange={(e) => setPairingCode(e.target.value)} />
          <button onClick={activate} disabled={busy} className="w-full rounded-2xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? '...' : 'تفعيل'}</button>
          {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        </div>
      </div>
    </div>
  );
}
