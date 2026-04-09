import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`verify-runtime-public-freshness: ${message}`);
  process.exit(1);
}

function assertContains(path, snippet) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const contents = readFileSync(path, 'utf8');
  if (!contents.includes(snippet)) {
    fail(`${path} is missing required snippet: ${snippet}`);
  }
}

function assertNotContains(path, snippet) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const contents = readFileSync(path, 'utf8');
  if (contents.includes(snippet)) {
    fail(`${path} still contains forbidden snippet: ${snippet}`);
  }
}

assertContains('apps/web/src/app/api/ops/menu/_utils.ts', 'await revalidatePublicMenuForCafeId(ctx.cafeId);');
assertContains('apps/web/src/lib/public-ordering.ts', 'export async function revalidatePublicMenuForCafeId(cafeId: string): Promise<void>');
assertContains('apps/web/src/app/api/public/cafes/[slug]/menu/route.ts', "'Cache-Control': 'no-store, max-age=0, must-revalidate'");
assertContains('apps/web/public/sw.js', 'async function networkFirstMenu(request)');
assertContains('apps/web/public/sw.js', 'event.respondWith(networkFirstMenu(request));');
assertContains('apps/web/src/lib/control-plane/runtime-status-sync.ts', 'const DIRECT_DISPATCH_TIMEOUT_MS = 1_500;');
assertContains('apps/web/src/lib/control-plane/runtime-status-sync.ts', 'const response = await fetch(target, {');
assertContains('apps/web/src/app/api/internal/platform/runtime-status/sync/route.ts', "METHOD_NOT_ALLOWED");
assertNotContains('apps/web/src/app/api/internal/platform/runtime-status/sync/route.ts', 'return POST(req);');
console.log('verify-runtime-public-freshness: ok');
