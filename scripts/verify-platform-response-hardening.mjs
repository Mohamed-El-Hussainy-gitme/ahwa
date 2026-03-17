import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`verify-platform-response-hardening: ${message}`);
  process.exit(1);
}

function assertContains(path, snippet) {
  if (!existsSync(path)) {
    fail(`missing file: ${path}`);
  }
  const contents = readFileSync(path, 'utf8');
  if (!contents.includes(snippet)) {
    fail(`${path} is missing required snippet: ${snippet}`);
  }
}

assertContains('apps/web/src/lib/platform-data.ts', 'export function extractCafeListItems');
assertContains('apps/web/src/lib/platform-data.ts', 'export function extractOperationalDatabaseOptions');
assertContains('apps/web/src/app/platform/cafes/PlatformCafesPageClient.tsx', "extractCafeListItems(payload)");
assertContains('apps/web/src/app/platform/PlatformDashboardClient.tsx', 'extractCafeListItems(json)');
assertContains('apps/web/src/app/platform/cafes/new/PlatformCreateCafePageClient.tsx', 'extractOperationalDatabaseOptions(payload)');
assertContains('apps/web/src/app/api/platform/_auth.ts', 'error.details');
assertContains('database/migrations/0036_platform_response_hardening.sql', "'[]'::jsonb) as owners");

console.log('verify-platform-response-hardening: ok');
