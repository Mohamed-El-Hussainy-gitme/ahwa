#!/usr/bin/env node
import process from 'node:process';
import { parseArgs, readJsonFile, writeJsonFile, envString, platformBootstrapAndLogin, fetchPlatformObservabilityOverview, sleep } from './common.mjs';
import { runLoadHarness } from './load-core.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl ?? envString('AHWA_LOAD_BASE_URL', 'http://127.0.0.1:3000')).replace(/\/$/, '');
  const fixturePath = String(args.fixture ?? envString('AHWA_LOAD_FIXTURE_PATH', 'tmp/load/ops-fixtures.json'));
  const snapshotPath = String(args.snapshotOutput ?? envString('AHWA_SOAK_SNAPSHOT_OUTPUT_PATH', 'tmp/load/ops-soak-snapshots.json'));
  const intervalMs = Number(args.snapshotIntervalMs ?? 60000);
  const fixtureBundle = await readJsonFile(fixturePath);
  let platformJar = null;
  if (fixtureBundle.platform?.email && fixtureBundle.platform?.password) {
    platformJar = await platformBootstrapAndLogin({
      baseUrl,
      installToken: envString('AHWA_E2E_INSTALL_TOKEN', envString('AHWA_INSTALL_TOKEN', '')),
      email: fixtureBundle.platform.email,
      displayName: fixtureBundle.platform.displayName ?? 'Load Admin',
      password: fixtureBundle.platform.password,
    });
  }

  const snapshots = [];
  let running = true;
  const poller = (async () => {
    while (running) {
      if (platformJar) {
        try {
          const overview = await fetchPlatformObservabilityOverview(baseUrl, platformJar);
          snapshots.push({ at: new Date().toISOString(), overview });
          await writeJsonFile(snapshotPath, { generatedAt: new Date().toISOString(), snapshots });
        } catch (error) {
          snapshots.push({ at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
        }
      }
      await sleep(intervalMs);
    }
  })();

  try {
    const { result, outputPath } = await runLoadHarness({ args });
    running = false;
    await poller;
    await writeJsonFile(snapshotPath, { generatedAt: new Date().toISOString(), snapshots });
    console.log(JSON.stringify({ ok: true, outputPath, snapshotPath, cyclesCompleted: result.counters['cycle.completed'] ?? 0 }, null, 2));
  } finally {
    running = false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
