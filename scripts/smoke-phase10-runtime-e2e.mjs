#!/usr/bin/env node
import assert from 'node:assert/strict';
import process from 'node:process';

const BASE_URL = (process.env.AHWA_E2E_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const INSTALL_TOKEN = process.env.AHWA_E2E_INSTALL_TOKEN || process.env.AHWA_INSTALL_TOKEN || '';
const PAIRING_CODE = process.env.AHWA_E2E_PAIRING_CODE || process.env.AHWA_DEVICE_PAIRING_CODE || INSTALL_TOKEN;
const PLATFORM_EMAIL = process.env.AHWA_E2E_PLATFORM_EMAIL || 'phase10.superadmin@example.com';
const PLATFORM_DISPLAY_NAME = process.env.AHWA_E2E_PLATFORM_DISPLAY_NAME || 'Phase 10 Super Admin';
const PLATFORM_PASSWORD = process.env.AHWA_E2E_PLATFORM_PASSWORD || 'Phase10Pass!123';
const OWNER_NAME = process.env.AHWA_E2E_OWNER_NAME || 'Phase 10 Owner';
const OWNER_PHONE = process.env.AHWA_E2E_OWNER_PHONE || '201000000010';
const OWNER_PASSWORD = process.env.AHWA_E2E_OWNER_PASSWORD || 'Phase10Owner!123';
const STAFF_SUPERVISOR_NAME = process.env.AHWA_E2E_SUPERVISOR_NAME || 'Supervisor Phase10';
const STAFF_WAITER_NAME = process.env.AHWA_E2E_WAITER_NAME || 'Waiter Phase10';
const STAFF_BARISTA_NAME = process.env.AHWA_E2E_BARISTA_NAME || 'Barista Phase10';
const STAFF_SUPERVISOR_PIN = process.env.AHWA_E2E_SUPERVISOR_PIN || '1111';
const STAFF_WAITER_PIN = process.env.AHWA_E2E_WAITER_PIN || '2222';
const STAFF_BARISTA_PIN = process.env.AHWA_E2E_BARISTA_PIN || '3333';

const unique = Date.now().toString(36).slice(-6).toLowerCase();
const cafeSlug = `${(process.env.AHWA_E2E_CAFE_SLUG_PREFIX || 'phase10').replace(/[^a-z0-9-]/gi, '').toLowerCase()}-${unique}`;
const cafeDisplayName = `${process.env.AHWA_E2E_CAFE_NAME_PREFIX || 'Phase 10 Cafe'} ${unique.toUpperCase()}`;
const sessionLabel = `SMK-${unique.toUpperCase()}`;
const debtorName = `Debtor ${unique.toUpperCase()}`;

class CookieJar {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }

  setFromHeaders(headers) {
    const values = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
    for (const value of values) {
      if (!value) continue;
      const first = value.split(';', 1)[0] ?? '';
      const index = first.indexOf('=');
      if (index <= 0) continue;
      const key = first.slice(0, index).trim();
      const rawValue = first.slice(index + 1).trim();
      if (!key) continue;
      if (!rawValue) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, rawValue);
      }
    }
  }

  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function request(jar, method, path, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const cookieHeader = jar?.header();
  if (cookieHeader) headers.cookie = cookieHeader;
  if (body !== undefined && !('content-type' in Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])))) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  jar?.setFromHeaders(response.headers);

  let json = null;
  const text = await response.text();
  if (text) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }

  return { response, json, text };
}

function assertOk(result, label) {
  const { response, json, text } = result;
  if (!response.ok || (json && typeof json === 'object' && 'ok' in json && json.ok === false)) {
    throw new Error(`${label} failed: HTTP ${response.status} :: ${JSON.stringify(json ?? text)}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openSseStream(jar) {
  const headers = {};
  const cookieHeader = jar.header();
  if (cookieHeader) headers.cookie = cookieHeader;
  const response = await fetch(`${BASE_URL}/api/ops/events`, { method: 'GET', headers });
  if (!response.ok || !response.body) {
    throw new Error(`ops events stream failed: HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];

  const pump = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (buffer.includes('\n\n')) {
        const index = buffer.indexOf('\n\n');
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = parseSseBlock(block);
        if (event) events.push(event);
      }
    }
  })();

  return {
    events,
    async waitFor(predicate, timeoutMs = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const found = events.find(predicate);
        if (found) return found;
        await sleep(50);
      }
      throw new Error(`Timed out waiting for SSE event after ${timeoutMs}ms`);
    },
    async close() {
      try { await reader.cancel(); } catch {}
      await pump.catch(() => undefined);
    },
  };
}

function parseSseBlock(block) {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join('\n');
  let data = raw;
  try { data = JSON.parse(raw); } catch {}
  return { event, data };
}

function findByName(staff, name) {
  return staff.find((item) => String(item.fullName) === name);
}

async function main() {
  if (!INSTALL_TOKEN) {
    console.warn('Warning: AHWA_E2E_INSTALL_TOKEN / AHWA_INSTALL_TOKEN is empty. Bootstrap may fail if protection is enabled.');
  }
  if (!PAIRING_CODE) {
    throw new Error('AHWA_E2E_PAIRING_CODE or AHWA_DEVICE_PAIRING_CODE (or AHWA_INSTALL_TOKEN) is required for device activation.');
  }

  const platformJar = new CookieJar('platform');
  const ownerJar = new CookieJar('owner');
  const waiterJar = new CookieJar('waiter');
  const baristaJar = new CookieJar('barista');

  console.log('1) bootstrap super admin');
  const bootstrap = await request(platformJar, 'POST', '/api/platform/bootstrap', {
    email: PLATFORM_EMAIL,
    displayName: PLATFORM_DISPLAY_NAME,
    password: PLATFORM_PASSWORD,
    installToken: INSTALL_TOKEN,
  }, INSTALL_TOKEN ? { 'x-ahwa-install-token': INSTALL_TOKEN } : {});
  if (!(bootstrap.response.ok || bootstrap.response.status === 409)) {
    throw new Error(`bootstrap failed: HTTP ${bootstrap.response.status} :: ${JSON.stringify(bootstrap.json ?? bootstrap.text)}`);
  }

  console.log('2) platform login');
  assertOk(await request(platformJar, 'POST', '/api/platform/auth/login', {
    email: PLATFORM_EMAIL,
    password: PLATFORM_PASSWORD,
  }), 'platform login');
  const platformMe = await request(platformJar, 'GET', '/api/platform/session/me');
  assertOk(platformMe, 'platform session me');

  console.log('3) create cafe + owner');
  const createCafe = await request(platformJar, 'POST', '/api/platform/cafes/create', {
    cafeSlug,
    cafeDisplayName,
    ownerFullName: OWNER_NAME,
    ownerPhone: OWNER_PHONE,
    ownerPassword: OWNER_PASSWORD,
  });
  assertOk(createCafe, 'platform create cafe');

  const cafes = await request(platformJar, 'GET', '/api/platform/cafes/list');
  assertOk(cafes, 'platform cafes list');
  const cafeRow = (cafes.json?.items ?? []).find((item) => String(item.cafe_slug ?? item.slug ?? '').toLowerCase() === cafeSlug);
  assert.ok(cafeRow, 'created cafe should appear in platform cafes list');
  const cafeId = String(cafeRow.cafe_id ?? cafeRow.id ?? '');
  assert.ok(cafeId, 'created cafe id must be available');

  console.log('4) owner login');
  assertOk(await request(ownerJar, 'POST', '/api/auth/owner-login', {
    slug: cafeSlug,
    phone: OWNER_PHONE,
    password: OWNER_PASSWORD,
  }), 'owner login');
  const ownerMe = await request(ownerJar, 'GET', '/api/runtime/me');
  assertOk(ownerMe, 'owner runtime me');
  assert.equal(ownerMe.json?.me?.accountKind, 'owner');

  console.log('5) create staff');
  assertOk(await request(ownerJar, 'POST', '/api/owner/staff/create', { name: STAFF_SUPERVISOR_NAME, pin: STAFF_SUPERVISOR_PIN, employeeCode: `SUP-${unique}` }), 'create supervisor');
  assertOk(await request(ownerJar, 'POST', '/api/owner/staff/create', { name: STAFF_WAITER_NAME, pin: STAFF_WAITER_PIN, employeeCode: `WTR-${unique}` }), 'create waiter');
  assertOk(await request(ownerJar, 'POST', '/api/owner/staff/create', { name: STAFF_BARISTA_NAME, pin: STAFF_BARISTA_PIN, employeeCode: `BAR-${unique}` }), 'create barista');

  const staffList = await request(ownerJar, 'GET', '/api/owner/staff/list');
  assertOk(staffList, 'staff list');
  const staff = staffList.json?.staff ?? [];
  const supervisor = findByName(staff, STAFF_SUPERVISOR_NAME);
  const waiter = findByName(staff, STAFF_WAITER_NAME);
  const barista = findByName(staff, STAFF_BARISTA_NAME);
  assert.ok(supervisor?.id, 'supervisor id missing');
  assert.ok(waiter?.id, 'waiter id missing');
  assert.ok(barista?.id, 'barista id missing');

  console.log('6) open shift');
  const openShift = await request(ownerJar, 'POST', '/api/owner/shift/open', {
    kind: 'morning',
    notes: `phase10 smoke ${unique}`,
    assignments: [
      { userId: supervisor.id, role: 'supervisor' },
      { userId: waiter.id, role: 'waiter' },
      { userId: barista.id, role: 'barista' },
    ],
  });
  assertOk(openShift, 'shift open');
  const shiftId = String(openShift.json?.shift?.id ?? '');
  assert.ok(shiftId, 'opened shift id missing');
  const shiftState = await request(ownerJar, 'GET', '/api/owner/shift/state');
  assertOk(shiftState, 'shift state');
  assert.equal(shiftState.json?.shift?.isOpen, true);

  console.log('7) create menu');
  const createSection = await request(ownerJar, 'POST', '/api/ops/menu/sections/create', {
    title: `Drinks ${unique}`,
    stationCode: 'barista',
    sortOrder: 10,
  });
  assertOk(createSection, 'create menu section');
  const sectionId = String(createSection.json?.sectionId ?? '');
  assert.ok(sectionId, 'section id missing');
  const createProduct = await request(ownerJar, 'POST', '/api/ops/menu/products/create', {
    sectionId,
    productName: `Coffee ${unique}`,
    stationCode: 'barista',
    unitPrice: 25,
  });
  assertOk(createProduct, 'create menu product');
  const productId = String(createProduct.json?.productId ?? '');
  assert.ok(productId, 'product id missing');

  console.log('8) activate waiter/barista devices + staff login');
  assertOk(await request(waiterJar, 'POST', '/api/device-gate/resolve', { slug: cafeSlug }), 'waiter device resolve');
  assertOk(await request(waiterJar, 'POST', '/api/device-gate/activate', {
    slug: cafeSlug,
    pairingCode: PAIRING_CODE,
    label: `Waiter Device ${unique}`,
    deviceType: 'mobile_phone',
    deviceMode: 'shared_runtime',
    stationType: 'service',
  }), 'waiter device activate');
  assertOk(await request(waiterJar, 'POST', '/api/auth/staff-login', {
    cafeSlug,
    name: STAFF_WAITER_NAME,
    pin: STAFF_WAITER_PIN,
  }), 'waiter login');

  assertOk(await request(baristaJar, 'POST', '/api/device-gate/resolve', { slug: cafeSlug }), 'barista device resolve');
  assertOk(await request(baristaJar, 'POST', '/api/device-gate/activate', {
    slug: cafeSlug,
    pairingCode: PAIRING_CODE,
    label: `Barista Device ${unique}`,
    deviceType: 'tablet',
    deviceMode: 'station_only',
    stationType: 'barista',
  }), 'barista device activate');
  assertOk(await request(baristaJar, 'POST', '/api/auth/staff-login', {
    cafeSlug,
    name: STAFF_BARISTA_NAME,
    pin: STAFF_BARISTA_PIN,
  }), 'barista login');

  console.log('9) open SSE stream');
  const sse = await openSseStream(ownerJar);
  await sse.waitFor((event) => event.event === 'ready', 3000);

  console.log('10) open session + create order');
  const openSession = await request(waiterJar, 'POST', '/api/ops/sessions/open-or-resume', { label: sessionLabel });
  assertOk(openSession, 'open or resume session');
  const serviceSessionId = String(openSession.json?.sessionId ?? '');
  assert.ok(serviceSessionId, 'service session id missing');
  await sse.waitFor((event) => event.data?.type === 'session.opened' || event.data?.type === 'session.resumed', 4000);

  const createOrder = await request(waiterJar, 'POST', '/api/ops/orders/create-with-items', {
    serviceSessionId,
    items: [{ productId, quantity: 2 }],
  });
  assertOk(createOrder, 'create order');
  await sse.waitFor((event) => event.data?.type === 'order.submitted', 4000);

  console.log('11) station queue -> partial ready -> deliver -> settle');
  const baristaWorkspace1 = await request(baristaJar, 'POST', '/api/ops/workspaces/station', { stationCode: 'barista' });
  assertOk(baristaWorkspace1, 'barista workspace');
  const queueItem = (baristaWorkspace1.json?.queue ?? [])[0];
  assert.ok(queueItem?.orderItemId, 'queue item missing');
  const orderItemId = String(queueItem.orderItemId);

  assertOk(await request(baristaJar, 'POST', '/api/ops/fulfillment/partial-ready', {
    orderItemId,
    quantity: 1,
  }), 'partial ready');
  await sse.waitFor((event) => event.data?.type === 'station.partial_ready', 4000);

  const readyList1 = await request(waiterJar, 'POST', '/api/ops/delivery/ready-list', {});
  assertOk(readyList1, 'ready list after partial ready');
  assert.ok((readyList1.json ?? []).some((item) => String(item.orderItemId) === orderItemId && Number(item.qtyReadyForDelivery) >= 1), 'ready item must be deliverable');

  assertOk(await request(waiterJar, 'POST', '/api/ops/delivery/deliver', {
    orderItemId,
    quantity: 1,
  }), 'deliver quantity 1');
  await sse.waitFor((event) => event.data?.type === 'delivery.delivered', 4000);

  const billable1 = await request(ownerJar, 'POST', '/api/ops/billing/billable', {});
  assertOk(billable1, 'billing workspace first pass');
  const billableItem1 = (billable1.json ?? []).find((item) => String(item.orderItemId) === orderItemId);
  assert.ok(billableItem1 && Number(billableItem1.qtyBillable) === 1, 'first billable qty should equal 1');

  assertOk(await request(ownerJar, 'POST', '/api/ops/billing/settle', {
    allocations: [{ orderItemId, quantity: 1 }],
  }), 'settle first delivered item');
  await sse.waitFor((event) => event.data?.type === 'billing.settled', 4000);

  console.log('12) ready second quantity -> deliver -> defer -> repay');
  assertOk(await request(baristaJar, 'POST', '/api/ops/fulfillment/ready', {
    orderItemId,
    quantity: 1,
  }), 'ready second quantity');
  await sse.waitFor((event) => event.data?.type === 'station.ready', 4000);

  assertOk(await request(waiterJar, 'POST', '/api/ops/delivery/deliver', {
    orderItemId,
    quantity: 1,
  }), 'deliver second quantity');
  await sse.waitFor((event) => event.data?.type === 'delivery.delivered', 4000);

  assertOk(await request(ownerJar, 'POST', '/api/ops/billing/defer', {
    debtorName,
    allocations: [{ orderItemId, quantity: 1 }],
  }), 'defer second delivered item');
  await sse.waitFor((event) => event.data?.type === 'billing.deferred', 4000);

  const deferredBalance1 = await request(ownerJar, 'POST', '/api/ops/deferred/balance', { debtorName });
  assertOk(deferredBalance1, 'deferred balance after debt');
  assert.ok(Number(deferredBalance1.json?.balance ?? 0) === 25, 'deferred balance should equal 25 after debt');

  assertOk(await request(ownerJar, 'POST', '/api/ops/deferred/repay', {
    debtorName,
    amount: 25,
  }), 'repay deferred balance');
  await sse.waitFor((event) => event.data?.type === 'deferred.repaid', 4000);

  const deferredBalance2 = await request(ownerJar, 'POST', '/api/ops/deferred/balance', { debtorName });
  assertOk(deferredBalance2, 'deferred balance after repayment');
  assert.ok(Number(deferredBalance2.json?.balance ?? 0) === 0, 'deferred balance should return to zero after repayment');

  console.log('13) close session -> reports -> close shift');
  assertOk(await request(waiterJar, 'POST', '/api/ops/sessions/close', { serviceSessionId }), 'close session');
  await sse.waitFor((event) => event.data?.type === 'session.closed', 4000);

  const reports = await request(ownerJar, 'POST', '/api/ops/workspaces/reports', {});
  assertOk(reports, 'reports workspace');
  assert.ok(Array.isArray(reports.json?.products), 'reports workspace should include products array');
  assert.ok(Array.isArray(reports.json?.shiftHistory), 'reports workspace should include shiftHistory array');

  const snapshot = await request(ownerJar, 'POST', '/api/owner/shift/close-snapshot', { shiftId });
  assertOk(snapshot, 'shift close snapshot');

  const closeShift = await request(ownerJar, 'POST', '/api/owner/shift/close', { shiftId, notes: `phase10 close ${unique}` });
  assertOk(closeShift, 'close shift');
  await sse.waitFor((event) => event.data?.type === 'shift.closed', 4000);

  const shiftStateClosed = await request(ownerJar, 'GET', '/api/owner/shift/state');
  assertOk(shiftStateClosed, 'shift state after close');
  assert.equal(shiftStateClosed.json?.shift, null);

  await sse.close();

  console.log('\nPhase 10 end-to-end smoke passed.');
  console.log(JSON.stringify({
    cafeSlug,
    cafeId,
    shiftId,
    serviceSessionId,
    debtorName,
  }, null, 2));
}

main().catch((error) => {
  console.error('\nPhase 10 end-to-end smoke failed.');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
