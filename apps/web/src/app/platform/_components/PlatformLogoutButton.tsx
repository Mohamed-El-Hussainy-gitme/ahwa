'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PlatformLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    try {
      setBusy(true);
      await fetch('/api/platform/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      router.replace('/platform/login');
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={busy}
      className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
    </button>
  );
}
