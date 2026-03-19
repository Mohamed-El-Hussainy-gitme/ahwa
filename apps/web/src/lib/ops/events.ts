import type { OpsRealtimeEvent } from './types';
import { getOpsEventBus } from './event-bus';
import { normalizeOpsRealtimeEvent, type OpsRealtimeEventInput } from './event-bus/schema';
import type { OpsEventBusSubscribeOptions } from './event-bus/types';

export async function publishOpsEvent(input: OpsRealtimeEventInput): Promise<OpsRealtimeEvent> {
  const event = normalizeOpsRealtimeEvent(input);
  return getOpsEventBus().publish(event);
}

export function subscribeOpsEvents(
  options: OpsEventBusSubscribeOptions,
  listener: (event: OpsRealtimeEvent) => void,
) {
  return getOpsEventBus().subscribe(options, listener);
}
