import 'server-only';

export type OpsEventBusConfiguredDriver = 'auto' | 'memory' | 'redis';
export type OpsEventBusResolvedDriver = 'memory' | 'redis';

type RedisUrlResolution = {
  raw: string;
  normalized: string | null;
  configured: boolean;
  valid: boolean;
  error: string | null;
};

export type OpsEventBusConfig = {
  configuredDriver: OpsEventBusConfiguredDriver;
  resolvedDriver: OpsEventBusResolvedDriver;
  redis: RedisUrlResolution;
  redisPrefix: string;
  redisMaxLen: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
  errorLogThrottleMs: number;
};

function readEnv(name: string, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}

function stripWrappingQuotes(value: string) {
  let current = value.trim();
  while (current.length >= 2) {
    const first = current[0];
    const last = current[current.length - 1];
    if ((first === '"' || first === '\'') && first === last) {
      current = current.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return current;
}

function parseConfiguredDriver(): OpsEventBusConfiguredDriver {
  const value = readEnv('AHWA_OPS_EVENT_BUS_DRIVER', 'auto').toLowerCase();
  if (value === 'memory' || value === 'redis') {
    return value;
  }
  return 'auto';
}

function resolveRedisUrl(): RedisUrlResolution {
  const raw = readEnv('AHWA_OPS_EVENT_BUS_REDIS_URL');
  if (!raw) {
    return {
      raw: '',
      normalized: null,
      configured: false,
      valid: false,
      error: null,
    };
  }

  const normalized = stripWrappingQuotes(raw);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      return {
        raw,
        normalized,
        configured: true,
        valid: false,
        error: 'AHWA_OPS_EVENT_BUS_REDIS_URL must start with redis:// or rediss://',
      };
    }
    return {
      raw,
      normalized,
      configured: true,
      valid: true,
      error: null,
    };
  } catch {
    return {
      raw,
      normalized,
      configured: true,
      valid: false,
      error: 'AHWA_OPS_EVENT_BUS_REDIS_URL is not a valid Redis URL',
    };
  }
}

function parsePositiveNumber(name: string, fallback: number, minimum = 1) {
  const parsed = Number(readEnv(name, String(fallback)));
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }
  return Math.trunc(parsed);
}

export function getOpsEventBusConfig(): OpsEventBusConfig {
  const configuredDriver = parseConfiguredDriver();
  const redis = resolveRedisUrl();
  const resolvedDriver: OpsEventBusResolvedDriver = configuredDriver === 'memory'
    ? 'memory'
    : redis.valid
      ? 'redis'
      : 'memory';

  return {
    configuredDriver,
    resolvedDriver,
    redis,
    redisPrefix: readEnv('AHWA_OPS_EVENT_BUS_REDIS_PREFIX', 'ahwa') || 'ahwa',
    redisMaxLen: parsePositiveNumber('AHWA_OPS_EVENT_BUS_REDIS_MAXLEN', 20_000, 100),
    circuitFailureThreshold: parsePositiveNumber('AHWA_OPS_EVENT_BUS_CIRCUIT_FAILURE_THRESHOLD', 3, 1),
    circuitCooldownMs: parsePositiveNumber('AHWA_OPS_EVENT_BUS_CIRCUIT_COOLDOWN_MS', 30_000, 1_000),
    errorLogThrottleMs: parsePositiveNumber('AHWA_OPS_EVENT_BUS_ERROR_LOG_THROTTLE_MS', 15_000, 1_000),
  };
}
