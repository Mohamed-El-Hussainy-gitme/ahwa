#!/usr/bin/env node
import process from 'node:process';
import {
  assertOk,
  envString,
  fetchPlatformObservabilityOverview,
  hydrateCafeFixture,
  makeIdempotencyHeaders,
  openSseStream,
  parseArgs,
  platformBootstrapAndLogin,
  pollUntil,
  randomSuffix,
  readJsonFile,
  request,
  writeJsonFile,
} from './common.mjs';

async function createCycleSeed(baseUrl, fixture, actors, stationCode = 'barista') {
  const sessionLabel = `FAIL-${stationCode.toUpperCase()}-${randomSuffix(6).toUpperCase()}`;
  const product = fixture.products[stationCode];
  const open = await request(baseUrl, actors.waiterJar, 'POST', '/api/ops/sessions/open-or-resume', { label: sessionLabel });
  assertOk(open, 'failure lab session open');
  const serviceSessionId = String(open.json?.sessionId ?? '');
  const create = await request(baseUrl, actors.waiterJar, 'POST', '/api/ops/orders/create-with-items', {
    serviceSessionId,
    items: [{ productId: product.productId, quantity: 1 }],
  });
  assertOk(create, 'failure lab create order');
  const stationActor = stationCode === 'shisha' ? actors.shishaJar : actors.baristaJar;
  const queueItem = await pollUntil(
    async () => {
      const workspace = await request(baseUrl, stationActor, 'POST', '/api/ops/workspaces/station', { stationCode });
      assertOk(workspace, 'failure lab station workspace');
      return (workspace.json?.queue ?? []).find((item) => String(item.sessionLabel) === sessionLabel) ?? null;
    },
    (value) => Boolean(value?.orderItemId),
    8000,
  );
  return { sessionLabel, serviceSessionId, orderItemId: String(queueItem.orderItemId ?? ''), stationCode };
}

async function duplicateReadyTest(baseUrl, fixture, actors) {
  const seed = await createCycleSeed(baseUrl, fixture, actors, 'barista');
  const key = `dup-ready-${randomSuffix(10)}`;
  const [first, second] = await Promise.all([
    request(baseUrl, actors.baristaJar, 'POST', '/api/ops/fulfillment/ready', { orderItemId: seed.orderItemId, quantity: 1 }, makeIdempotencyHeaders(key)),
    request(baseUrl, actors.baristaJar, 'POST', '/api/ops/fulfillment/ready', { orderItemId: seed.orderItemId, quantity: 1 }, makeIdempotencyHeaders(key)),
  ]);
  const okResponses = [first, second].filter((result) => result.response.ok).length;
  if (okResponses < 1) {
    throw new Error('duplicate ready did not produce a successful response');
  }
  const readyItem = await pollUntil(
    async () => {
      const list = await request(baseUrl, actors.waiterJar, 'POST', '/api/ops/delivery/ready-list', {});
      assertOk(list, 'duplicate ready list');
      return (Array.isArray(list.json) ? list.json : []).find((item) => String(item.sessionLabel) === seed.sessionLabel) ?? null;
    },
    (value) => Number(value?.qtyReadyForDelivery ?? 0) === 1,
    8000,
  );
  return {
    test: 'duplicate_ready_dedup',
    ok: Number(readyItem.qtyReadyForDelivery ?? 0) === 1,
    duplicateResponses: [first.response.status, second.response.status],
  };
}

async function reconnectStormTest(baseUrl, fixture, actors) {
  const streamOne = await openSseStream(baseUrl, actors.ownerJar);
  await streamOne.waitFor((event) => event.event === 'ready', 4000);
  const seed = await createCycleSeed(baseUrl, fixture, actors, 'barista');
  const submitted = await streamOne.waitFor((event) => event.data?.type === 'order.submitted' && event.data?.cafeId === fixture.cafeId, 8000);
  const lastEventId = streamOne.getLastEventId();
  await streamOne.close();

  await request(baseUrl, actors.baristaJar, 'POST', '/api/ops/fulfillment/ready', { orderItemId: seed.orderItemId, quantity: 1 });
  const streamTwo = await openSseStream(baseUrl, actors.ownerJar, { lastEventId });
  await streamTwo.waitFor((event) => event.event === 'ready', 4000);
  const replayed = await streamTwo.waitFor((event) => event.data?.type === 'station.ready' && event.data?.cafeId === fixture.cafeId, 8000);
  await streamTwo.close();

  return {
    test: 'sse_reconnect_continuity',
    ok: Boolean(submitted?.id) && Boolean(replayed?.id),
    lastEventId,
    replayedEventId: replayed?.id ?? null,
  };
}

async function outboxDrainTest(baseUrl, fixtureBundle, fixture, actors, platformJar) {
  const manualDispatchRequired = String(process.env.AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED ?? '').trim().toLowerCase();
  if (!(manualDispatchRequired === '0' || manualDispatchRequired === 'false' || manualDispatchRequired === 'off')) {
    return {
      test: 'outbox_backlog_and_drain',
      ok: true,
      skipped: true,
      reason: 'set AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED=false on the target app to make backlog growth observable in this test',
    };
  }

  for (let index = 0; index < 5; index += 1) {
    const seed = await createCycleSeed(baseUrl, fixture, actors, index % 2 === 0 ? 'barista' : 'shisha');
    const stationActor = seed.stationCode === 'shisha' ? actors.shishaJar : actors.baristaJar;
    await request(baseUrl, stationActor, 'POST', '/api/ops/fulfillment/ready', { orderItemId: seed.orderItemId, quantity: 1 });
  }

  const before = await fetchPlatformObservabilityOverview(baseUrl, platformJar);
  const shardBefore = (before.rows ?? []).find((row) => row.database_key === fixture.databaseKey) ?? null;
  const pendingBefore = Number(shardBefore?.outbox?.pending_count ?? 0);

  const dispatchAuth = envString('CRON_SECRET', '');
  if (!dispatchAuth) {
    return {
      test: 'outbox_backlog_and_drain',
      ok: false,
      skipped: true,
      reason: 'CRON_SECRET is required to call /api/internal/ops/outbox/dispatch',
      pendingBefore,
    };
  }

  const dispatched = await request(
    baseUrl,
    null,
    'POST',
    `/api/internal/ops/outbox/dispatch?databaseKey=${encodeURIComponent(fixture.databaseKey)}`,
    undefined,
    { authorization: `Bearer ${dispatchAuth}` },
  );
  assertOk(dispatched, 'manual outbox dispatch');

  const after = await pollUntil(
    () => fetchPlatformObservabilityOverview(baseUrl, platformJar),
    (overview) => {
      const row = (overview.rows ?? []).find((candidate) => candidate.database_key === fixture.databaseKey) ?? null;
      return Number(row?.outbox?.pending_count ?? 0) <= pendingBefore;
    },
    15000,
    500,
  );

  const shardAfter = (after.rows ?? []).find((row) => row.database_key === fixture.databaseKey) ?? null;
  return {
    test: 'outbox_backlog_and_drain',
    ok: Number(shardAfter?.outbox?.pending_count ?? 0) <= pendingBefore,
    pendingBefore,
    pendingAfter: Number(shardAfter?.outbox?.pending_count ?? 0),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl ?? envString('AHWA_LOAD_BASE_URL', 'http://127.0.0.1:3000')).replace(/\/$/, '');
  const fixturePath = String(args.fixture ?? envString('AHWA_LOAD_FIXTURE_PATH', 'tmp/load/ops-fixtures.json'));
  const outputPath = String(args.output ?? envString('AHWA_FAILURE_OUTPUT_PATH', 'tmp/load/ops-failure-result.json'));
  const pairingCode = envString('AHWA_E2E_PAIRING_CODE', envString('AHWA_DEVICE_PAIRING_CODE', envString('AHWA_INSTALL_TOKEN', '')));
  const fixtureBundle = await readJsonFile(fixturePath);
  const fixture = Array.isArray(fixtureBundle.fixtures) ? fixtureBundle.fixtures[0] : null;
  if (!fixture) {
    throw new Error(`No fixtures found in ${fixturePath}`);
  }
  const actors = await hydrateCafeFixture(baseUrl, pairingCode, fixture);
  const platformJar = await platformBootstrapAndLogin({
    baseUrl,
    installToken: envString('AHWA_E2E_INSTALL_TOKEN', envString('AHWA_INSTALL_TOKEN', '')),
    email: fixtureBundle.platform.email,
    displayName: fixtureBundle.platform.displayName ?? 'Load Admin',
    password: fixtureBundle.platform.password,
  });

  const results = [
    await duplicateReadyTest(baseUrl, fixture, actors),
    await reconnectStormTest(baseUrl, fixture, actors),
    await outboxDrainTest(baseUrl, fixtureBundle, fixture, actors, platformJar),
  ];

  await writeJsonFile(outputPath, {
    generatedAt: new Date().toISOString(),
    baseUrl,
    fixture: { cafeSlug: fixture.cafeSlug, databaseKey: fixture.databaseKey, tier: fixture.tier },
    results,
  });

  console.log(JSON.stringify({ ok: results.every((item) => item.ok || item.skipped), outputPath, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
