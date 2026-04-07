import 'server-only';
import { listConfiguredOperationalDatabasesFromEnv } from '@/lib/supabase/env';

const ENV_VALIDATION_KEY = '__ahwa_env_validation_result__';

type GlobalEnvScope = typeof globalThis & {
  [ENV_VALIDATION_KEY]?: EnvValidationResult;
};

export type EnvValidationIssue = {
  key: string;
  message: string;
};

export type EnvValidationResult = {
  ok: boolean;
  issues: EnvValidationIssue[];
};

export type OutboxDispatchPolicy = 'inline' | 'background' | 'hybrid';

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function hasWrappedQuotes(value: string) {
  return value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
}

function looksLikeNestedAssignment(value: string) {
  return /^[A-Z0-9_]+=.+$/i.test(value);
}


function validateQStash(issues: EnvValidationIssue[]) {
  const token = readEnv('QSTASH_TOKEN');
  const current = readEnv('QSTASH_CURRENT_SIGNING_KEY');
  const next = readEnv('QSTASH_NEXT_SIGNING_KEY');
  if (!token && !current && !next) {
    return;
  }

  if (!token) {
    issues.push({ key: 'QSTASH_TOKEN', message: 'is required when any QStash env is configured' });
  }

  const appUrl = readEnv('NEXT_PUBLIC_APP_URL');
  if (!appUrl) {
    issues.push({ key: 'NEXT_PUBLIC_APP_URL', message: 'is required when QStash is configured' });
  }
}

function validateRedisUrl(raw: string, issues: EnvValidationIssue[]) {
  if (!raw) {
    return;
  }
  if (hasWrappedQuotes(raw)) {
    issues.push({
      key: 'AHWA_OPS_EVENT_BUS_REDIS_URL',
      message: 'must not be wrapped in quotes',
    });
    return;
  }
  if (looksLikeNestedAssignment(raw)) {
    issues.push({
      key: 'AHWA_OPS_EVENT_BUS_REDIS_URL',
      message: 'must contain only the raw redis url, not NAME=value syntax',
    });
    return;
  }
  try {
    const parsed = new URL(raw);
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      issues.push({
        key: 'AHWA_OPS_EVENT_BUS_REDIS_URL',
        message: 'must start with redis:// or rediss://',
      });
    }
  } catch {
    issues.push({
      key: 'AHWA_OPS_EVENT_BUS_REDIS_URL',
      message: 'must be a valid redis url',
    });
  }
}

export function getOutboxDispatchPolicy(): OutboxDispatchPolicy {
  const raw = readEnv('AHWA_OPS_OUTBOX_DISPATCH_POLICY').toLowerCase();
  if (raw === 'inline' || raw === 'background' || raw === 'hybrid') {
    return raw;
  }
  const inlineEnabled = readEnv('AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED').toLowerCase();
  return inlineEnabled === '1' || inlineEnabled === 'true' || inlineEnabled === 'on' ? 'hybrid' : 'background';
}

export function validateCriticalEnv(force = false): EnvValidationResult {
  const scope = globalThis as GlobalEnvScope;
  if (!force && scope[ENV_VALIDATION_KEY]) {
    return scope[ENV_VALIDATION_KEY] as EnvValidationResult;
  }

  const issues: EnvValidationIssue[] = [];
  const required = [
    'CONTROL_PLANE_SUPABASE_URL',
    'CONTROL_PLANE_SUPABASE_SECRET_KEY',
    'CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY',
    'AHWA_SESSION_SECRET',
    'CRON_SECRET',
  ];

  for (const key of required) {
    if (!readEnv(key)) {
      issues.push({ key, message: 'is required' });
    }
  }

  if (listConfiguredOperationalDatabasesFromEnv().length === 0) {
    issues.push({
      key: 'AHWA_OPERATIONAL_DATABASE__<TOKEN>__*',
      message: 'at least one operational database group is required',
    });
  }

  const driver = readEnv('AHWA_OPS_EVENT_BUS_DRIVER').toLowerCase() || 'auto';
  const redisUrl = readEnv('AHWA_OPS_EVENT_BUS_REDIS_URL');
  if (driver === 'redis' || (driver === 'auto' && redisUrl)) {
    if (!redisUrl) {
      issues.push({ key: 'AHWA_OPS_EVENT_BUS_REDIS_URL', message: 'is required when redis event bus is enabled' });
    } else {
      validateRedisUrl(redisUrl, issues);
    }
  }

  validateQStash(issues);

  const result = { ok: issues.length === 0, issues } satisfies EnvValidationResult;
  scope[ENV_VALIDATION_KEY] = result;
  return result;
}

export function assertCriticalEnv() {
  const result = validateCriticalEnv();
  if (!result.ok) {
    const details = result.issues.map((issue) => `${issue.key} ${issue.message}`).join('; ');
    throw new Error(`ENV_VALIDATION_FAILED: ${details}`);
  }
}
