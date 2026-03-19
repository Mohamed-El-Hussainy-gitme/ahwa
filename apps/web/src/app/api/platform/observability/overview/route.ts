import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { loadPlatformObservabilityOverview } from '@/lib/control-plane/observability';
import { assertPlatformEnv, platformJsonError, platformOk, requirePlatformAdmin } from '@/app/api/platform/_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const observation = beginServerObservation('platform.observability.overview', {
    path: new URL(req.url).pathname,
  }, req.headers.get('x-request-id'));

  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const data = await loadPlatformObservabilityOverview();
    logServerObservation(observation, 'ok', {
      shardCount: data.summary.shard_count,
      criticalShardCount: data.summary.critical_shard_count,
      warningShardCount: data.summary.warning_shard_count,
    });
    return platformOk(data);
  } catch (error) {
    logServerObservation(observation, 'error', {
      message: error instanceof Error ? error.message : 'LOAD_PLATFORM_OBSERVABILITY_FAILED',
    });
    return platformJsonError(error);
  }
}
