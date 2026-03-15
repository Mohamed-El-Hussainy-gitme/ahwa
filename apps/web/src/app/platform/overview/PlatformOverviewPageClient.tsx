'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';
import PlatformPortfolioOverview from '../PlatformPortfolioOverview';

type SupportNewCountResponse = {
  ok: true;
  data: {
    summary: {
      new_count: number;
    };
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSupportNewCountResponse(value: unknown): value is SupportNewCountResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.data === null ||
      (isRecord(value.data) &&
        isRecord(value.data.summary) &&
        typeof value.data.summary.new_count === 'number'))
  );
}

export default function PlatformOverviewPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supportNewCount, setSupportNewCount] = useState(0);
  const [refreshRevision, setRefreshRevision] = useState(0);

  const selectedCafeId = searchParams.get('selected') ?? '';

  const loadSupportCount = useCallback(async () => {
    try {
      const response = await fetch('/api/platform/support/messages?status=new', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isPlatformApiOk(payload)) {
        throw new Error(extractPlatformApiErrorMessage(payload, 'LOAD_SUPPORT_COUNT_FAILED'));
      }
      setSupportNewCount(isSupportNewCountResponse(payload) ? payload.data?.summary.new_count ?? 0 : 0);
    } catch {
      setSupportNewCount(0);
    }
  }, []);

  useEffect(() => {
    void loadSupportCount();
  }, [loadSupportCount]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void loadSupportCount();
            setRefreshRevision((value) => value + 1);
          }}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          تحديث النظرة العامة
        </button>
      </div>
      <PlatformPortfolioOverview
        selectedCafeId={selectedCafeId}
        onSelectCafe={(id) => router.push(`/platform/cafes?selected=${encodeURIComponent(id)}`)}
        refreshRevision={refreshRevision}
        supportNewCount={supportNewCount}
      />
    </div>
  );
}
