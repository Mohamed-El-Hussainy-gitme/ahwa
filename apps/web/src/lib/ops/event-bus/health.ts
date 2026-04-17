import 'server-only';
import { getOpsEventBusConfig, type OpsEventBusConfiguredDriver, type OpsEventBusResolvedDriver } from './config';

export type OpsEventBusHealthSnapshot = {
  configuredDriver: OpsEventBusConfiguredDriver;
  preferredDriver: OpsEventBusResolvedDriver;
  activeDriver: OpsEventBusResolvedDriver;
  redisConfigured: boolean;
  redisUrlValid: boolean;
  redisTls: boolean;
  fallbackToMemory: boolean;
  circuitOpen: boolean;
  circuitOpenUntil: string | null;
  consecutiveFailures: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

type MutableOpsEventBusHealthState = OpsEventBusHealthSnapshot & {
  circuitOpenUntilMs: number | null;
  lastLoggedAtMs: number | null;
  lastLoggedMessage: string | null;
};

const OPS_EVENT_BUS_HEALTH_KEY = '__ahwa_ops_event_bus_health__';

type GlobalOpsEventBusHealthScope = typeof globalThis & {
  [OPS_EVENT_BUS_HEALTH_KEY]?: MutableOpsEventBusHealthState;
};

function buildInitialState(): MutableOpsEventBusHealthState {
  const config = getOpsEventBusConfig();
  return {
    configuredDriver: config.configuredDriver,
    preferredDriver: config.resolvedDriver,
    activeDriver: config.resolvedDriver,
    redisConfigured: config.redis.configured,
    redisUrlValid: config.redis.valid,
    redisTls: Boolean(config.redis.normalized?.startsWith('rediss://')),
    fallbackToMemory: config.resolvedDriver === 'memory',
    circuitOpen: false,
    circuitOpenUntil: null,
    circuitOpenUntilMs: null,
    consecutiveFailures: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: config.redis.error,
    lastLoggedAtMs: null,
    lastLoggedMessage: null,
  };
}

function getMutableState(): MutableOpsEventBusHealthState {
  const scope = globalThis as GlobalOpsEventBusHealthScope;
  if (!scope[OPS_EVENT_BUS_HEALTH_KEY]) {
    scope[OPS_EVENT_BUS_HEALTH_KEY] = buildInitialState();
  }
  return scope[OPS_EVENT_BUS_HEALTH_KEY] as MutableOpsEventBusHealthState;
}

function nowIso() {
  return new Date().toISOString();
}

function syncCircuitState(state: MutableOpsEventBusHealthState) {
  if (!state.circuitOpenUntilMs) {
    state.circuitOpen = false;
    state.circuitOpenUntil = null;
    return;
  }
  if (state.circuitOpenUntilMs <= Date.now()) {
    state.circuitOpenUntilMs = null;
    state.circuitOpen = false;
    state.circuitOpenUntil = null;
    state.consecutiveFailures = 0;
    return;
  }
  state.circuitOpen = true;
  state.circuitOpenUntil = new Date(state.circuitOpenUntilMs).toISOString();
}

function maybeLogError(state: MutableOpsEventBusHealthState, message: string) {
  const config = getOpsEventBusConfig();
  const now = Date.now();
  if (
    state.lastLoggedMessage === message
    && state.lastLoggedAtMs !== null
    && now - state.lastLoggedAtMs < config.errorLogThrottleMs
  ) {
    return;
  }
  state.lastLoggedAtMs = now;
  state.lastLoggedMessage = message;
  console.error(`[ops-event-bus] ${message}`);
}

export function getOpsEventBusHealthSnapshot(): OpsEventBusHealthSnapshot {
  const state = getMutableState();
  const config = getOpsEventBusConfig();
  state.configuredDriver = config.configuredDriver;
  state.preferredDriver = config.resolvedDriver;
  state.redisConfigured = config.redis.configured;
  state.redisUrlValid = config.redis.valid;
  state.redisTls = Boolean(config.redis.normalized?.startsWith('rediss://'));
  if (!config.redis.valid && config.redis.error) {
    state.lastError = config.redis.error;
  }
  syncCircuitState(state);
  return {
    configuredDriver: state.configuredDriver,
    preferredDriver: state.preferredDriver,
    activeDriver: state.activeDriver,
    redisConfigured: state.redisConfigured,
    redisUrlValid: state.redisUrlValid,
    redisTls: state.redisTls,
    fallbackToMemory: state.fallbackToMemory,
    circuitOpen: state.circuitOpen,
    circuitOpenUntil: state.circuitOpenUntil,
    consecutiveFailures: state.consecutiveFailures,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastError: state.lastError,
  };
}

export function isOpsEventBusCircuitOpen() {
  const state = getMutableState();
  syncCircuitState(state);
  return state.circuitOpen;
}

export function recordOpsEventBusAttempt(driver: OpsEventBusResolvedDriver) {
  const state = getMutableState();
  state.lastAttemptAt = nowIso();
  state.activeDriver = driver;
  if (driver === 'memory') {
    state.fallbackToMemory = state.preferredDriver !== 'memory';
  }
}

export function recordOpsEventBusSuccess(driver: OpsEventBusResolvedDriver) {
  const state = getMutableState();
  state.lastSuccessAt = nowIso();
  state.lastError = null;
  state.activeDriver = driver;
  state.fallbackToMemory = driver === 'memory' && state.preferredDriver !== 'memory';
  if (driver === 'redis') {
    state.consecutiveFailures = 0;
    state.circuitOpenUntilMs = null;
    state.circuitOpen = false;
    state.circuitOpenUntil = null;
  }
}

export function recordOpsEventBusFailure(driver: OpsEventBusResolvedDriver, error: unknown) {
  const config = getOpsEventBusConfig();
  const state = getMutableState();
  const message = error instanceof Error ? error.message : String(error ?? 'OPS_EVENT_BUS_FAILURE');
  state.lastFailureAt = nowIso();
  state.lastError = message;
  state.activeDriver = driver;
  if (driver === 'redis') {
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= config.circuitFailureThreshold) {
      state.circuitOpenUntilMs = Date.now() + config.circuitCooldownMs;
    }
    syncCircuitState(state);
    state.fallbackToMemory = true;
  }
  maybeLogError(state, `${driver} driver failure: ${message}`);
}
