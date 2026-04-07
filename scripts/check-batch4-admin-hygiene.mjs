import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`batch4-admin-hygiene: ${message}`);
  process.exit(1);
}

function expectIncludes(path, snippets) {
  const content = readFileSync(path, 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      fail(`${path} is missing expected snippet: ${snippet}`);
    }
  }
}

expectIncludes('apps/web/src/app/platform/PlatformDashboardClient.tsx', [
  "label: 'النظرة العامة'",
  "label: 'القهاوي'",
  "label: 'المتابعة المالية'",
  "useState<'all' | 'active' | 'inactive'>('active')",
]);

expectIncludes('apps/web/src/app/platform/PlatformPortfolioOverview.tsx', [
  'ملخص سريع',
  'آخر النشاط على المحفظة',
]);

expectIncludes('apps/web/src/app/(app)/menu/page.tsx', [
  'const [showArchived, setShowArchived] = useState(false);',
  'إظهار المؤرشف/المعطل',
]);

expectIncludes('apps/web/src/app/(app)/staff/page.tsx', [
  'تبدأ القائمة اليومية بالنشطين فقط',
]);

expectIncludes('docs/term-mapping.md', [
  'item issue',
  'left employee',
  'المتابعة المالية',
]);

expectIncludes('docs/execution/phase-d-4-archive-naming-release.md', [
  'archive discipline',
  'naming review',
  'release checks',
]);

expectIncludes('docs/execution/phase-d-4-acceptance-checklist.md', [
  'المقاهي المفعلة فقط',
  'المؤرشف/المعطل',
  'الموظف left',
]);

console.log('batch4-admin-hygiene: ok');
