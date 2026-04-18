import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`ops-admin-resilience: ${message}`);
  process.exit(1);
}

function expectExists(path) {
  if (!existsSync(path)) {
    fail(`missing file: ${path}`);
  }
}

function expectIncludes(path, snippets) {
  const content = readFileSync(path, 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      fail(`${path} is missing expected snippet: ${snippet}`);
    }
  }
}

[
  'apps/web/src/lib/pwa/storage.ts',
  'apps/web/src/lib/pwa/use-persistent-draft.ts',
  'apps/web/src/lib/pwa/workspace-snapshot.ts',
  'apps/web/src/lib/pwa/admin-queue.ts',
  'apps/web/src/lib/pwa/provider.tsx',
  'apps/web/src/components/OfflineOpsBanner.tsx',
  'apps/web/src/app/api/owner/shift/checklists/route.ts',
  'database/migrations/0079_ops_shift_checklists.sql',
  'docs/execution/ops-admin-resilience-smoke-runbook.md',
].forEach(expectExists);

expectIncludes('package.json', [
  '"verify:ops-admin-resilience"',
]);

expectIncludes('README.md', [
  'verify:ops-admin-resilience',
  'ops-admin-resilience-smoke-runbook.md',
]);

expectIncludes('apps/web/README.md', [
  'verify:ops-admin-resilience',
]);

expectIncludes('scripts/check-release-readiness.mjs', [
  'verify-ops-admin-resilience.mjs',
]);

expectIncludes('apps/web/src/app/(app)/ClientProviders.tsx', [
  'OpsPwaProvider',
  'OfflineOpsBanner',
]);

expectIncludes('apps/web/src/lib/pwa/use-persistent-draft.ts', [
  'skipNextPersistRef.current = true;',
  'removeLocalStorage(storageKey);',
]);

expectIncludes('apps/web/src/lib/pwa/admin-queue.ts', [
  'RETRYABLE_HTTP_STATUSES',
  'computeRetryDelayMs',
  'nextRetryAt',
  'clearDraftKeys',
]);

expectIncludes('apps/web/src/app/(app)/inventory/page.tsx', [
  'useWorkspaceSnapshot',
  'usePersistentDraft',
  'runQueueableMutation',
  'workspace:inventory',
]);

expectIncludes('apps/web/src/app/(app)/complaints/page.tsx', [
  'useWorkspaceSnapshot',
  'usePersistentDraft',
  'runQueueableComplaintMutation',
  'workspace:complaints',
]);

expectIncludes('apps/web/src/app/(app)/shift/page.tsx', [
  'usePersistentDraft<ShiftChecklistFormState>',
  '/api/owner/shift/checklists',
  'lastQueueSyncAtRef',
  'clearDraftKeys: [stage === \'opening\' ? SHIFT_DRAFT_KEYS.openingChecklist : SHIFT_DRAFT_KEYS.closingChecklist]',
]);

expectIncludes('apps/web/src/app/api/owner/shift/open/route.ts', [
  'openingChecklist',
]);

expectIncludes('apps/web/src/app/api/owner/shift/close/route.ts', [
  'closingChecklist',
]);

expectIncludes('apps/web/src/app/api/owner/shift/close-snapshot/route.ts', [
  'checklists',
]);

expectIncludes('apps/web/src/app/api/ops/_reports.ts', [
  'checklistSummary',
]);

console.log('ops-admin-resilience: ok');
