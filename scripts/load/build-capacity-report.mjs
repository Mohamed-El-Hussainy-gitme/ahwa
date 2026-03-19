#!/usr/bin/env node
import process from 'node:process';
import { envNumber, parseArgs, readJsonFile, writeJsonFile } from './common.mjs';

function perMinute(value, durationMs) {
  if (!durationMs) return 0;
  return Number(((value / durationMs) * 60_000).toFixed(2));
}

function summarizeTierEnvelope(loadResult, tier, headroomFactor) {
  const tierCounters = loadResult.tierCounters?.[tier] ?? {};
  const fixtureCount = Number(loadResult.tierFixtureCounts?.[tier] ?? 0);
  const durationMs = Number(loadResult.durationMs ?? 0);
  const cyclesCompleted = Number(tierCounters.cyclesCompleted ?? 0);
  const actionsCompleted = Number(tierCounters.actionsCompleted ?? 0);
  const cyclesPerMinutePerCafe = fixtureCount > 0 ? perMinute(cyclesCompleted / fixtureCount, durationMs) : 0;
  const actionsPerMinutePerCafe = fixtureCount > 0 ? perMinute(actionsCompleted / fixtureCount, durationMs) : 0;
  return {
    fixtureCount,
    cyclesCompleted,
    actionsCompleted,
    cyclesPerMinutePerCafe,
    actionsPerMinutePerCafe,
    recommendedActionsPerMinutePerCafe: Number((actionsPerMinutePerCafe * headroomFactor).toFixed(2)),
  };
}

function buildShardRecommendations(loadResult, headroomFactor) {
  const durationMs = Number(loadResult.durationMs ?? 0);
  const rows = Array.isArray(loadResult.observability?.rows) ? loadResult.observability.rows : [];
  return rows.map((row) => {
    const databaseKey = row.database_key;
    const counters = loadResult.databaseCounters?.[databaseKey] ?? {};
    const actionsPerMinute = perMinute(Number(counters.actionsCompleted ?? 0), durationMs);
    const cyclesPerMinute = perMinute(Number(counters.cyclesCompleted ?? 0), durationMs);
    const safeActionsPerMinute = Number((actionsPerMinute * headroomFactor).toFixed(2));
    const remainingLoadUnits = Math.max(Number(row.max_load_units ?? 0) - Number(row.total_load_units ?? 0), 0);
    return {
      databaseKey,
      status: row.status,
      capacityState: row.capacity_state,
      activeCafeCount: row.runtime?.active_cafe_count ?? 0,
      totalLoadUnits: row.total_load_units ?? 0,
      maxLoadUnits: row.max_load_units ?? 0,
      remainingLoadUnits,
      observedActionsPerMinute: actionsPerMinute,
      observedCyclesPerMinute: cyclesPerMinute,
      safeActionsPerMinute,
      deadLetters: row.outbox?.dead_letter_count ?? 0,
      outboxPending: row.outbox?.pending_count ?? 0,
      recommendation:
        row.capacity_state === 'full' || row.capacity_state === 'critical'
          ? 'do-not-place-new-cafes'
          : row.capacity_state === 'warning' || row.status === 'warning'
            ? 'only-place-small-or-medium-after-retest'
            : 'accept-new-cafes-with-tested-tier-budgets',
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = String(args.input ?? process.env.AHWA_LOAD_OUTPUT_PATH ?? 'tmp/load/ops-load-result.json');
  const outputPath = String(args.output ?? process.env.AHWA_CAPACITY_OUTPUT_PATH ?? 'tmp/load/ops-capacity-report.json');
  const headroomFactor = Number(args.headroomFactor ?? envNumber('AHWA_CAPACITY_HEADROOM_FACTOR', 0.7));
  const loadResult = await readJsonFile(inputPath);
  const tiers = Object.keys(loadResult.tierFixtureCounts ?? {});
  const tierEnvelopes = Object.fromEntries(tiers.map((tier) => [tier, summarizeTierEnvelope(loadResult, tier, headroomFactor)]));
  const shardRecommendations = buildShardRecommendations(loadResult, headroomFactor);
  const report = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    headroomFactor,
    durationMs: loadResult.durationMs,
    actionP95: Object.fromEntries(
      Object.entries(loadResult.actionLatencies ?? {}).map(([name, summary]) => [name, summary.p95Ms ?? 0]),
    ),
    actionP99: Object.fromEntries(
      Object.entries(loadResult.actionLatencies ?? {}).map(([name, summary]) => [name, summary.p99Ms ?? 0]),
    ),
    totalCyclesCompleted: Number(loadResult.counters?.['cycle.completed'] ?? 0),
    totalActionsCompleted: Number(loadResult.tierCounters?.small?.actionsCompleted ?? 0)
      + Number(loadResult.tierCounters?.medium?.actionsCompleted ?? 0)
      + Number(loadResult.tierCounters?.heavy?.actionsCompleted ?? 0)
      + Number(loadResult.tierCounters?.enterprise?.actionsCompleted ?? 0),
    tierEnvelopes,
    shardRecommendations,
    notes: [
      'هذه الأرقام مشتقة من تشغيل load profile فعلي وليست حدًا نهائيًا ثابتًا.',
      'كرر الاختبار على نفس البيئة ونفس الشاردات وقت الذروة قبل اعتماد أرقام البيع والتسويق.',
      'إذا ارتفع p95 أو ظهرت dead letters أو outbox lag، خفّض headroomFactor وأعد الاختبار.',
    ],
  };
  await writeJsonFile(outputPath, report);
  console.log(JSON.stringify({ ok: true, outputPath, shardCount: shardRecommendations.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
