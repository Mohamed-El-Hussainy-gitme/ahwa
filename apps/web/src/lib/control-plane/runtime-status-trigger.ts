import 'server-only';

import { syncCafeRuntimeStatusToControlPlane } from '@/lib/control-plane/runtime-status-sync';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

type RuntimeStatusBinding = {
  cafeId: string;
  databaseKey: string;
};

type TriggerOptions = {
  source: string;
  ttlMs?: number;
  timeoutMs?: number;
};

function normalizeBinding(input: RuntimeStatusBinding | null | undefined): RuntimeStatusBinding | null {
  if (!input) return null;

  const cafeId = String(input.cafeId ?? '').trim();
  const databaseKey = String(input.databaseKey ?? '').trim();
  if (!cafeId || !databaseKey) {
    return null;
  }

  if (!isOperationalDatabaseConfigured(databaseKey)) {
    return null;
  }

  return { cafeId, databaseKey };
}

export function triggerCafeRuntimeStatusSync(
  bindingInput: RuntimeStatusBinding | null | undefined,
  options: TriggerOptions,
): void {
  const binding = normalizeBinding(bindingInput);
  if (!binding) return;

  void syncCafeRuntimeStatusToControlPlane(binding, {
    source: options.source,
    ttlMs: options.ttlMs ?? 5_000,
    timeoutMs: options.timeoutMs ?? 2_500,
  }).catch(() => undefined);
}
