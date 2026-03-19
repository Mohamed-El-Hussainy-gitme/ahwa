#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export class CookieJar {
  constructor(name = 'jar') {
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

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomSuffix(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length).toLowerCase();
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, rawValue] = token.slice(2).split('=', 2);
    if (!rawKey) continue;
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (rawValue !== undefined) {
      args[key] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export function envNumber(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envString(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function parseDurationMs(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.trunc(value));
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return Math.max(1, Math.trunc(direct));
  const match = normalized.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const unit = match[2];
  const factor = unit === 'ms' ? 1 : unit === 's' ? 1_000 : unit === 'm' ? 60_000 : 3_600_000;
  return Math.max(1, Math.trunc(amount * factor));
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function percentile(samples, fraction) {
  if (!samples.length) return 0;
  const ordered = [...samples].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(fraction * ordered.length) - 1));
  return ordered[index];
}

export function summarizeSamples(samples) {
  if (!samples.length) {
    return { count: 0, minMs: 0, maxMs: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    avgMs: Number((total / samples.length).toFixed(2)),
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
  };
}

export function summarizeCounters(counterMap) {
  return Object.fromEntries(
    Object.entries(counterMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value]),
  );
}

export class MetricsStore {
  constructor() {
    this.actionLatencies = new Map();
    this.counters = Object.create(null);
    this.errors = Object.create(null);
    this.tierCounters = new Map();
    this.databaseCounters = new Map();
    this.startedAt = Date.now();
  }

  recordLatency(name, ms) {
    const bucket = this.actionLatencies.get(name) ?? [];
    bucket.push(ms);
    this.actionLatencies.set(name, bucket);
    this.increment(`action.${name}.count`);
  }

  increment(name, amount = 1) {
    this.counters[name] = (this.counters[name] ?? 0) + amount;
  }

  recordError(scope, error) {
    const message = error instanceof Error ? error.message : String(error ?? 'UNKNOWN_ERROR');
    const key = `${scope}:${message}`;
    this.errors[key] = (this.errors[key] ?? 0) + 1;
    this.increment(`error.${scope}`);
  }

  recordTier(tier, field, amount = 1) {
    const bucket = this.tierCounters.get(tier) ?? Object.create(null);
    bucket[field] = (bucket[field] ?? 0) + amount;
    this.tierCounters.set(tier, bucket);
  }

  recordDatabase(databaseKey, field, amount = 1) {
    const bucket = this.databaseCounters.get(databaseKey) ?? Object.create(null);
    bucket[field] = (bucket[field] ?? 0) + amount;
    this.databaseCounters.set(databaseKey, bucket);
  }

  toJSON(extra = {}) {
    const durationMs = Date.now() - this.startedAt;
    return {
      generatedAt: nowIso(),
      durationMs,
      actionLatencies: Object.fromEntries(
        Array.from(this.actionLatencies.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, samples]) => [name, summarizeSamples(samples)]),
      ),
      counters: summarizeCounters(this.counters),
      errors: summarizeCounters(this.errors),
      tierCounters: Object.fromEntries(
        Array.from(this.tierCounters.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([tier, fields]) => [tier, summarizeCounters(fields)]),
      ),
      databaseCounters: Object.fromEntries(
        Array.from(this.databaseCounters.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([databaseKey, fields]) => [databaseKey, summarizeCounters(fields)]),
      ),
      ...extra,
    };
  }
}

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function request(baseUrl, jar, method, pathName, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const cookieHeader = jar?.header();
  if (cookieHeader) headers.cookie = cookieHeader;
  if (body !== undefined) {
    const normalized = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    if (!('content-type' in normalized)) {
      headers['content-type'] = 'application/json';
    }
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${pathName}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  jar?.setFromHeaders(response.headers);

  let json = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return { response, json, text };
}

export function assertOk(result, label) {
  if (!result.response.ok || (result.json && typeof result.json === 'object' && 'ok' in result.json && result.json.ok === false)) {
    throw new Error(`${label} failed: HTTP ${result.response.status} :: ${JSON.stringify(result.json ?? result.text)}`);
  }
}

function parseSseBlock(block) {
  const lines = block.split('\n');
  let event = 'message';
  let id = null;
  const dataLines = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('id:')) id = line.slice(3).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  const raw = dataLines.join('\n');
  let data = raw;
  try {
    data = JSON.parse(raw);
  } catch {}
  return { id, event, data };
}

export async function openSseStream(baseUrl, jar, options = {}) {
  const headers = {};
  const cookieHeader = jar.header();
  if (cookieHeader) headers.cookie = cookieHeader;
  if (options.lastEventId) headers['Last-Event-ID'] = options.lastEventId;
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/ops/events${options.cursor ? `?cursor=${encodeURIComponent(options.cursor)}` : ''}`, {
    method: 'GET',
    headers,
  });
  if (!response.ok || !response.body) {
    throw new Error(`ops events stream failed: HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  let lastEventId = options.lastEventId ?? null;

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
        if (!event) continue;
        if (event.id) lastEventId = event.id;
        events.push(event);
      }
    }
  })();

  return {
    events,
    getLastEventId() {
      return lastEventId;
    },
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

export function makeIdempotencyHeaders(key) {
  return key ? { 'x-ahwa-idempotency-key': key } : {};
}

export function randomBetween(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export function weightedChoice(weights) {
  const entries = Object.entries(weights).filter(([, value]) => Number(value) > 0);
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);
  if (!entries.length || total <= 0) {
    return entries[0]?.[0] ?? null;
  }
  let target = Math.random() * total;
  for (const [key, value] of entries) {
    target -= Number(value);
    if (target <= 0) return key;
  }
  return entries.at(-1)?.[0] ?? null;
}

export async function platformBootstrapAndLogin({ baseUrl, installToken, email, displayName, password }) {
  const jar = new CookieJar('platform');
  const bootstrap = await request(baseUrl, jar, 'POST', '/api/platform/bootstrap', {
    email,
    displayName,
    password,
    installToken,
  }, installToken ? { 'x-ahwa-install-token': installToken } : {});
  if (!(bootstrap.response.ok || bootstrap.response.status === 409)) {
    throw new Error(`platform bootstrap failed: HTTP ${bootstrap.response.status} :: ${JSON.stringify(bootstrap.json ?? bootstrap.text)}`);
  }
  const login = await request(baseUrl, jar, 'POST', '/api/platform/auth/login', { email, password });
  assertOk(login, 'platform login');
  return jar;
}

export async function createCafeFixtureRecord({ baseUrl, platformJar, cafeSlug, cafeDisplayName, ownerFullName, ownerPhone, ownerPassword, cafeLoadTier, databaseKey }) {
  const createCafe = await request(baseUrl, platformJar, 'POST', '/api/platform/cafes/create', {
    cafeSlug,
    cafeDisplayName,
    ownerFullName,
    ownerPhone,
    ownerPassword,
    cafeLoadTier,
    databaseKey: databaseKey || undefined,
  });
  assertOk(createCafe, 'platform create cafe');
  const data = createCafe.json?.data ?? createCafe.json ?? {};
  return {
    cafeId: String(data.cafe_id ?? ''),
    slug: String(data.slug ?? cafeSlug),
    databaseKey: String(data.database_key ?? databaseKey ?? ''),
  };
}

export async function ownerLoginAndResolve(baseUrl, slug, phone, password) {
  const ownerJar = new CookieJar(`owner:${slug}`);
  const login = await request(baseUrl, ownerJar, 'POST', '/api/auth/owner-login', {
    slug,
    phone,
    password,
  });
  assertOk(login, 'owner login');
  const me = await request(baseUrl, ownerJar, 'GET', '/api/runtime/me');
  assertOk(me, 'owner runtime me');
  const payload = me.json?.me ?? me.json ?? {};
  const ownerUserId = String(payload.actorOwnerId ?? payload.opsActorId ?? payload.actorUserId ?? '');
  if (!ownerUserId) {
    throw new Error('OWNER_USER_ID_MISSING');
  }
  return { ownerJar, ownerUserId };
}

export async function createStaffMembers(baseUrl, ownerJar, records) {
  const staffIds = {};
  for (const record of records) {
    const created = await request(baseUrl, ownerJar, 'POST', '/api/owner/staff/create', {
      name: record.name,
      pin: record.pin,
      employeeCode: record.employeeCode,
    });
    assertOk(created, `create staff ${record.name}`);
  }
  const list = await request(baseUrl, ownerJar, 'GET', '/api/owner/staff/list');
  assertOk(list, 'owner staff list');
  const staff = ensureArray(list.json?.staff);
  for (const record of records) {
    const match = staff.find((item) => String(item.fullName) === record.name);
    assert.ok(match?.id, `staff id missing for ${record.name}`);
    staffIds[record.role] = String(match.id);
  }
  return staffIds;
}

export async function openOwnerShift(baseUrl, ownerJar, ownerUserId, assignments) {
  const result = await request(baseUrl, ownerJar, 'POST', '/api/owner/shift/open', {
    kind: 'morning',
    notes: `load fixture ${randomSuffix(8)}`,
    assignments: [
      { userId: ownerUserId, actorType: 'owner', role: 'supervisor' },
      ...assignments,
    ],
  });
  assertOk(result, 'owner shift open');
  const shiftId = String(result.json?.shift?.id ?? '');
  if (!shiftId) {
    throw new Error('SHIFT_ID_MISSING');
  }
  return shiftId;
}

export async function createMenuProducts(baseUrl, ownerJar, cafeTag) {
  const sections = {};
  const products = {};
  for (const stationCode of ['barista', 'shisha']) {
    const section = await request(baseUrl, ownerJar, 'POST', `/api/ops/menu/sections/create`, {
      title: `${stationCode.toUpperCase()} ${cafeTag}`,
      stationCode,
    });
    assertOk(section, `create ${stationCode} section`);
    const sectionId = String(section.json?.sectionId ?? '');
    const product = await request(baseUrl, ownerJar, 'POST', `/api/ops/menu/products/create`, {
      sectionId,
      productName: `${stationCode.toUpperCase()} Item ${cafeTag}`,
      stationCode,
      unitPrice: stationCode === 'shisha' ? 45 : 25,
    });
    assertOk(product, `create ${stationCode} product`);
    sections[stationCode] = sectionId;
    products[stationCode] = {
      productId: String(product.json?.productId ?? ''),
      productName: `${stationCode.toUpperCase()} Item ${cafeTag}`,
      unitPrice: stationCode === 'shisha' ? 45 : 25,
    };
  }
  return { sections, products };
}

export async function activateAndLoginStaff(baseUrl, slug, pairingCode, label, deviceMode, stationType, name, pin) {
  const jar = new CookieJar(`${stationType}:${slug}`);
  assertOk(await request(baseUrl, jar, 'POST', '/api/device-gate/resolve', { slug }), `${stationType} device resolve`);
  assertOk(await request(baseUrl, jar, 'POST', '/api/device-gate/activate', {
    slug,
    pairingCode,
    label,
    deviceType: stationType === 'barista' ? 'tablet' : stationType === 'shisha' ? 'mobile_phone' : 'mobile_phone',
    deviceMode,
    stationType,
  }), `${stationType} device activate`);
  assertOk(await request(baseUrl, jar, 'POST', '/api/auth/staff-login', {
    cafeSlug: slug,
    name,
    pin,
  }), `${stationType} staff login`);
  return jar;
}

export async function provisionCafeFixture({
  baseUrl,
  platformJar,
  pairingCode,
  cafeLoadTier,
  slugPrefix,
  displayPrefix,
  ownerNamePrefix,
  tierIndex,
  databaseKey,
}) {
  const unique = `${cafeLoadTier.slice(0, 2)}-${Date.now().toString(36)}-${randomSuffix(4)}`.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const cafeSlug = `${slugPrefix}-${unique}`.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const cafeDisplayName = `${displayPrefix} ${cafeLoadTier.toUpperCase()} ${tierIndex + 1}`;
  const ownerFullName = `${ownerNamePrefix} ${cafeLoadTier} ${tierIndex + 1}`;
  const ownerPhone = `2015${String(Date.now() + tierIndex).slice(-7)}`;
  const ownerPassword = `Owner!${randomSuffix(8)}A1`;

  const created = await createCafeFixtureRecord({
    baseUrl,
    platformJar,
    cafeSlug,
    cafeDisplayName,
    ownerFullName,
    ownerPhone,
    ownerPassword,
    cafeLoadTier,
    databaseKey,
  });

  const { ownerJar, ownerUserId } = await ownerLoginAndResolve(baseUrl, created.slug, ownerPhone, ownerPassword);
  const staffBlueprints = [
    { role: 'waiter', name: `Waiter ${unique}`, pin: '2222', employeeCode: `WTR-${randomSuffix(6).toUpperCase()}` },
    { role: 'barista', name: `Barista ${unique}`, pin: '3333', employeeCode: `BAR-${randomSuffix(6).toUpperCase()}` },
    { role: 'shisha', name: `Shisha ${unique}`, pin: '4444', employeeCode: `SHI-${randomSuffix(6).toUpperCase()}` },
  ];
  const staffIds = await createStaffMembers(baseUrl, ownerJar, staffBlueprints);
  const shiftId = await openOwnerShift(baseUrl, ownerJar, ownerUserId, [
    { userId: staffIds.waiter, role: 'waiter' },
    { userId: staffIds.barista, role: 'barista' },
    { userId: staffIds.shisha, role: 'shisha' },
  ]);
  const menu = await createMenuProducts(baseUrl, ownerJar, unique.toUpperCase());

  await activateAndLoginStaff(baseUrl, created.slug, pairingCode, `Waiter ${unique}`, 'shared_runtime', 'service', staffBlueprints[0].name, staffBlueprints[0].pin);
  const baristaJar = await activateAndLoginStaff(baseUrl, created.slug, pairingCode, `Barista ${unique}`, 'station_only', 'barista', staffBlueprints[1].name, staffBlueprints[1].pin);
  const shishaJar = await activateAndLoginStaff(baseUrl, created.slug, pairingCode, `Shisha ${unique}`, 'station_only', 'shisha', staffBlueprints[2].name, staffBlueprints[2].pin);
  void baristaJar;
  void shishaJar;

  return {
    cafeId: created.cafeId,
    cafeSlug: created.slug,
    cafeDisplayName,
    databaseKey: created.databaseKey,
    tier: cafeLoadTier,
    shiftId,
    owner: { fullName: ownerFullName, phone: ownerPhone, password: ownerPassword },
    staff: {
      waiter: { id: staffIds.waiter, name: staffBlueprints[0].name, pin: staffBlueprints[0].pin },
      barista: { id: staffIds.barista, name: staffBlueprints[1].name, pin: staffBlueprints[1].pin },
      shisha: { id: staffIds.shisha, name: staffBlueprints[2].name, pin: staffBlueprints[2].pin },
    },
    products: menu.products,
  };
}

export async function hydrateCafeFixture(baseUrl, pairingCode, fixture) {
  const { ownerJar } = await ownerLoginAndResolve(baseUrl, fixture.cafeSlug, fixture.owner.phone, fixture.owner.password);
  const waiterJar = await activateAndLoginStaff(baseUrl, fixture.cafeSlug, pairingCode, `Waiter ${fixture.cafeSlug}`, 'shared_runtime', 'service', fixture.staff.waiter.name, fixture.staff.waiter.pin);
  const baristaJar = await activateAndLoginStaff(baseUrl, fixture.cafeSlug, pairingCode, `Barista ${fixture.cafeSlug}`, 'station_only', 'barista', fixture.staff.barista.name, fixture.staff.barista.pin);
  const shishaJar = await activateAndLoginStaff(baseUrl, fixture.cafeSlug, pairingCode, `Shisha ${fixture.cafeSlug}`, 'station_only', 'shisha', fixture.staff.shisha.name, fixture.staff.shisha.pin);
  return { ownerJar, waiterJar, baristaJar, shishaJar };
}

export async function pollUntil(fn, predicate, timeoutMs, delayMs = 125) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (predicate(value)) return value;
    await sleep(delayMs);
  }
  throw new Error(`POLL_TIMEOUT_AFTER_${timeoutMs}MS`);
}

export async function fetchPlatformObservabilityOverview(baseUrl, platformJar) {
  const result = await request(baseUrl, platformJar, 'GET', '/api/platform/observability/overview');
  assertOk(result, 'platform observability overview');
  return result.json;
}

export function defaultLoadProfile() {
  return {
    name: 'default-ops-mix',
    durationMs: 180000,
    settleAfterEachCycle: true,
    tiers: {
      small: { cafes: 8, loopsPerCafe: 1, quantityRange: [1, 1], delayRangeMs: [400, 1200], stationWeights: { barista: 0.8, shisha: 0.2 } },
      medium: { cafes: 2, loopsPerCafe: 2, quantityRange: [1, 2], delayRangeMs: [250, 900], stationWeights: { barista: 0.75, shisha: 0.25 } },
      heavy: { cafes: 1, loopsPerCafe: 4, quantityRange: [1, 2], delayRangeMs: [100, 500], stationWeights: { barista: 0.7, shisha: 0.3 } },
      enterprise: { cafes: 0, loopsPerCafe: 6, quantityRange: [1, 3], delayRangeMs: [50, 250], stationWeights: { barista: 0.65, shisha: 0.35 } },
    },
  };
}

export async function resolveLoadProfile(profilePath) {
  if (!profilePath) {
    return defaultLoadProfile();
  }
  const fromFile = await readJsonFile(profilePath);
  return {
    ...defaultLoadProfile(),
    ...fromFile,
    tiers: {
      ...defaultLoadProfile().tiers,
      ...(fromFile.tiers ?? {}),
    },
  };
}

export function buildTierPlan(profile) {
  return Object.entries(profile.tiers ?? {})
    .filter(([, config]) => Number(config?.cafes ?? 0) > 0)
    .map(([tier, config]) => ({
      tier,
      cafes: Math.max(0, Math.trunc(Number(config.cafes ?? 0))),
      loopsPerCafe: Math.max(1, Math.trunc(Number(config.loopsPerCafe ?? 1))),
      quantityRange: Array.isArray(config.quantityRange) ? config.quantityRange : [1, 1],
      delayRangeMs: Array.isArray(config.delayRangeMs) ? config.delayRangeMs : [250, 1000],
      stationWeights: config.stationWeights ?? { barista: 1 },
    }));
}
