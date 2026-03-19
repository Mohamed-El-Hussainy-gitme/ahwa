import type { OpsRealtimeEvent } from '@/lib/ops/types';

export type OpsEventBusListener = (event: OpsRealtimeEvent) => void;

export type OpsEventBusSubscribeOptions = {
  cafeId: string;
  cursor?: string | null;
  signal?: AbortSignal;
  onError?: (error: Error) => void;
};

export interface OpsEventBus {
  publish(event: OpsRealtimeEvent): Promise<OpsRealtimeEvent>;
  subscribe(options: OpsEventBusSubscribeOptions, listener: OpsEventBusListener): Promise<() => void> | (() => void);
}
