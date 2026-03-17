import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`reporting-read-path: ${message}`);
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

expectIncludes('apps/web/src/app/api/ops/_reports.ts', [
  'buildValidatedSummaryBackedPeriod',
  'totalsCompatible(',
  'productCollectionsCompatible(',
  'staffCollectionsCompatible(',
  'dayCollectionsCompatible(',
  'return base;',
]);

expectIncludes('docs/domain/canonical-runtime-reference.md', [
  'اليوم: من `ops.shift_snapshots` عبر `ops.daily_snapshots`',
  'الأسبوع: من `ops.daily_snapshots`',
  'الشهر: من `ops.daily_snapshots`',
  'السنة: من `ops.monthly_summaries`',
]);

expectIncludes('docs/database/weekly-archiving.md', [
  'The reporting chain stays:',
  '`ops.monthly_summaries` from `ops.daily_snapshots`',
  '`ops.yearly_summaries` from `ops.monthly_summaries`',
  'the detail path wins',
]);

expectIncludes('database/README.md', [
  'Canonical report chain is `shift_snapshot -> daily -> weekly/monthly -> yearly`',
  'summary row is stale or incomplete',
]);

console.log('reporting-read-path: ok');
