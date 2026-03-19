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
    <PlatformPortfolioOverview
      selectedCafeId={selectedCafeId}
      onSelectCafe={(id) => router.push(`/platform/cafes?selected=${encodeURIComponent(id)}`)}
      refreshRevision={refreshRevision}
      supportNewCount={supportNewCount}
      onRefreshRequested={() => {
        void loadSupportCount();
        setRefreshRevision((value) => value + 1);
      }}
    />
  );
}
