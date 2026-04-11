#!/usr/bin/env node
import fs from 'node:fs';

const checks = [
  {
    file: 'apps/web/src/app/login/page.tsx',
    includes: ['resolveRuntimeNextPath', 'searchParams', 'const nextPath = resolveRuntimeNextPath'],
    excludes: ['if (me) {\n    if (resumePath) redirect(resumePath);'],
  },
  {
    file: 'apps/web/src/app/owner-login/page.tsx',
    includes: ['resolveRuntimeNextPath', 'searchParams', 'const nextPath = resolveRuntimeNextPath'],
    excludes: ['if (me) {\n    if (resumePath) redirect(resumePath);'],
  },
  {
    file: 'apps/web/src/app/c/[slug]/login/page.tsx',
    includes: ['resolveRuntimeNextPath', 'searchParams', 'const nextPath = resolveRuntimeNextPath'],
    excludes: ['if (me) {\n    if (resumePath) redirect(resumePath);'],
  },
  {
    file: 'apps/web/src/components/SessionLifecycleClient.tsx',
    includes: ["resolveRuntimeNextPath(searchParams?.get('next'))", 'const shouldResumeFromAuthPage = Boolean(nextPath);'],
    excludes: ["const next = searchParams?.get('next');\n          const fallback = readRuntimeLastPath() || '/dashboard';\n          const target = next && next.startsWith('/') ? next : fallback;"],
  },
  {
    file: 'apps/web/src/lib/runtime/navigation.ts',
    includes: ['isSafeRuntimeNextPath', 'getDefaultRuntimeHome'],
  },
];

for (const check of checks) {
  const text = fs.readFileSync(check.file, 'utf8');
  for (const marker of check.includes ?? []) {
    if (!text.includes(marker)) {
      console.error(`login-entry-contract: ${check.file} is missing marker ${marker}`);
      process.exit(1);
    }
  }
  for (const marker of check.excludes ?? []) {
    if (text.includes(marker)) {
      console.error(`login-entry-contract: ${check.file} still contains legacy marker ${marker}`);
      process.exit(1);
    }
  }
}

console.log('login-entry-contract: ok');
