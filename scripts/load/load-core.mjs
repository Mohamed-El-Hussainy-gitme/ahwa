#!/usr/bin/env node
import process from 'node:process';
import {
  MetricsStore,
  assertOk,
  buildTierPlan,
  envString,
  fetchPlatformObservabilityOverview,
  hydrateCafeFixture,
  parseArgs,
  pollUntil,
  randomBetween,
  request,
  resolveLoadProfile,
  sleep,
  weightedChoice,
  writeJsonFile,
  readJsonFile,
  platformBootstrapAndLogin,
} from './common.mjs';

async function loadStationQueue(baseUrl, jar, stationCode, sessionLabel) {
  const result = await request(baseUrl, jar, 'POST', '/api/ops/workspaces/station', { stationCode });
  assertOk(result, `${stationCode} workspace`);
  return (result.json?.queue ?? []).find((item) => String(item.sessionLabel) === sessionLabel) ?? null;
}

async function loadReadyItem(baseUrl, jar, sessionLabel) {
  const result = await request(baseUrl, jar, 'POST', '/api/ops/delivery/ready-list', {});
  assertOk(result, 'ready list');
  return (Array.isArray(result.json) ? result.json : []).find((item) => String(item.sessionLabel) === sessionLabel) ?? null;
}

async function loadBillableItem(baseUrl, ownerJar, sessionLabel) {
  const result = await request(baseUrl, ownerJar, 'POST', '/api/ops/billing/billable', {});
  assertOk(result, 'billable');
  return (Array.isArray(result.json) ? result.json : []).find((item) => String(item.sessionLabel) === sessionLabel) ?? null;
}

async function timeAction(metrics, name, run) {
  const started = Date.now();
  const value = await run();
  metrics.recordLatency(name, Date.now() - started);
  return value;
}

async function executeCafeCycle({ baseUrl, fixture, actors, config, metrics, cycleIndex }) {
  const startedAt = Date.now();
  const stationCode = weightedChoice(config.stationWeights) || 'barista';
  const quantity = randomBetween(Number(config.quantityRange?.[0] ?? 1), Number(config.quantityRange?.[1] ?? 1));
  const sessionLabel = `${fixture.tier.slice(0, 1).toUpperCase()}-${cycleIndex}-${Date.now().toString(36).slice(-4)}`;
  const stationActor = stationCode === 'shisha' ? actors.shishaJar : actors.baristaJar;
  const deliveryActor = stationCode === 'shisha' ? actors.shishaJar : actors.waiterJar;
  const product = fixture.products[stationCode];

  const openSession = await timeAction(metrics, 'session.open_or_resume', async () => {
    const result = await request(baseUrl, actors.waiterJar, 'POST', '/api/ops/sessions/open-or-resume', { label: sessionLabel });
    assertOk(result, 'session open or resume');
    return result;
  });
  const serviceSessionId = String(openSession.json?.sessionId ?? '');

  await timeAction(metrics, 'order.create_with_items', async () => {
    const result = await request(baseUrl, actors.waiterJar, 'POST', '/api/ops/orders/create-with-items', {
      serviceSessionId,
      items: [{ productId: product.productId, quantity }],
    });
    assertOk(result, 'order create');
    return result;
  });

  const queueItem = await pollUntil(
    () => loadStationQueue(baseUrl, stationActor, stationCode, sessionLabel),
    (value) => Boolean(value?.orderItemId),
    8000,
  );
  const orderItemId = String(queueItem.orderItemId ?? '');

  await timeAction(metrics, `station.${stationCode}.ready`, async () => {
    const result = await request(baseUrl, stationActor, 'POST', '/api/ops/fulfillment/ready', {
      orderItemId,
      quantity,
    });
    assertOk(result, `${stationCode} ready`);
    return result;
  });

  await pollUntil(
    () => loadReadyItem(baseUrl, deliveryActor, sessionLabel),
    (value) => Number(value?.qtyReadyForDelivery ?? 0) >= quantity,
    8000,
  );

  await timeAction(metrics, `delivery.${stationCode}.deliver`, async () => {
    const result = await request(baseUrl, deliveryActor, 'POST', '/api/ops/delivery/deliver', {
      orderItemId,
      quantity,
    });
    assertOk(result, `${stationCode} deliver`);
    return result;
  });

  await pollUntil(
    () => loadBillableItem(baseUrl, actors.ownerJar, sessionLabel),
    (value) => Number(value?.qtyBillable ?? 0) >= quantity,
    8000,
  );

  await timeAction(metrics, 'billing.settle', async () => {
    const result = await request(baseUrl, actors.ownerJar, 'POST', '/api/ops/billing/settle', {
      allocations: [{ orderItemId, quantity }],
    });
    assertOk(result, 'billing settle');
    return result;
  });

  await timeAction(metrics, 'session.close', async () => {
    const result = await request(baseUrl, actors.ownerJar, 'POST', '/api/ops/sessions/close', { serviceSessionId });
    assertOk(result, 'session close');
    return result;
  });

  metrics.recordLatency('cycle.total', Date.now() - startedAt);
  metrics.increment('cycle.completed');
  metrics.recordTier(fixture.tier, 'cyclesCompleted');
  metrics.recordDatabase(fixture.databaseKey || 'unknown', 'cyclesCompleted');
  metrics.recordTier(fixture.tier, 'actionsCompleted', 6);
  metrics.recordDatabase(fixture.databaseKey || 'unknown', 'actionsCompleted', 6);
}

export async function runLoadHarness(options = {}) {
  const args = options.args ?? parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl ?? envString('AHWA_LOAD_BASE_URL', 'http://127.0.0.1:3000')).replace(/\/$/, '');
  const fixturePath = String(args.fixture ?? envString('AHWA_LOAD_FIXTURE_PATH', 'tmp/load/ops-fixtures.json'));
  const profilePath = String(args.profile ?? envString('AHWA_LOAD_PROFILE_PATH', ''));
  const outputPath = String(args.output ?? envString('AHWA_LOAD_OUTPUT_PATH', 'tmp/load/ops-load-result.json'));
  const durationMs = Number(args.durationMs ?? 0) > 0 ? Number(args.durationMs) : undefined;
  const pairingCode = envString('AHWA_E2E_PAIRING_CODE', envString('AHWA_DEVICE_PAIRING_CODE', envString('AHWA_INSTALL_TOKEN', '')));
  const fixtureBundle = await readJsonFile(fixturePath);
  const profile = await resolveLoadProfile(profilePath || fixtureBundle.profilePath || '');
  const effectiveDurationMs = durationMs ?? Number(profile.durationMs ?? 180000);

  const fixtures = Array.isArray(fixtureBundle.fixtures) ? fixtureBundle.fixtures : [];
  if (!fixtures.length) {
    throw new Error(`No fixtures found in ${fixturePath}`);
  }

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

  const hydrated = [];
  for (const fixture of fixtures) {
    const actors = await hydrateCafeFixture(baseUrl, pairingCode, fixture);
    hydrated.push({ fixture, actors });
  }

  const metrics = new MetricsStore();
  const tierPlan = buildTierPlan(profile);
  const finishAt = Date.now() + effectiveDurationMs;
  const jobs = [];

  for (const plan of tierPlan) {
    const matching = hydrated.filter((entry) => entry.fixture.tier === plan.tier);
    for (const entry of matching) {
      for (let loop = 0; loop < plan.loopsPerCafe; loop += 1) {
        jobs.push((async () => {
          let cycleIndex = 0;
          while (Date.now() < finishAt) {
            try {
              await executeCafeCycle({
                baseUrl,
                fixture: entry.fixture,
                actors: entry.actors,
                config: plan,
                metrics,
                cycleIndex: cycleIndex += 1,
              });
            } catch (error) {
              metrics.recordError('cycle', error);
              metrics.recordTier(entry.fixture.tier, 'cycleErrors');
              metrics.recordDatabase(entry.fixture.databaseKey || 'unknown', 'cycleErrors');
            }
            const [minDelay, maxDelay] = Array.isArray(plan.delayRangeMs) ? plan.delayRangeMs : [250, 1000];
            await sleep(randomBetween(Number(minDelay ?? 250), Number(maxDelay ?? 1000)));
          }
        })());
      }
    }
  }

  await Promise.all(jobs);

  let observability = null;
  if (platformJar) {
    try {
      observability = await fetchPlatformObservabilityOverview(baseUrl, platformJar);
    } catch (error) {
      metrics.recordError('observability.snapshot', error);
    }
  }

  const result = metrics.toJSON({
    baseUrl,
    profile,
    fixturePath,
    fixtureCount: fixtures.length,
    observability,
    tierFixtureCounts: Object.fromEntries(
      Array.from(new Set(fixtures.map((fixture) => fixture.tier))).sort().map((tier) => [tier, fixtures.filter((fixture) => fixture.tier === tier).length]),
    ),
    databaseFixtureCounts: Object.fromEntries(
      Array.from(new Set(fixtures.map((fixture) => fixture.databaseKey || 'unknown'))).sort().map((databaseKey) => [databaseKey, fixtures.filter((fixture) => (fixture.databaseKey || 'unknown') === databaseKey).length]),
    ),
  });

  await writeJsonFile(outputPath, result);
  return { result, outputPath };
}
