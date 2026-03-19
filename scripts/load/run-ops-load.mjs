#!/usr/bin/env node
import { runLoadHarness } from './load-core.mjs';

runLoadHarness().then(({ result, outputPath }) => {
  console.log(JSON.stringify({
    ok: true,
    outputPath,
    cyclesCompleted: result.counters['cycle.completed'] ?? 0,
    cycleP95Ms: result.actionLatencies['cycle.total']?.p95Ms ?? 0,
    billingP95Ms: result.actionLatencies['billing.settle']?.p95Ms ?? 0,
    errors: Object.keys(result.errors).length,
  }, null, 2));
}).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
