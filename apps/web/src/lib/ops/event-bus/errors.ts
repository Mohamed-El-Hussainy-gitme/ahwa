export class OpsEventBusDegradedError extends Error {
  readonly code = 'OPS_EVENT_BUS_DEGRADED';
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'OpsEventBusDegradedError';
    this.reason = reason;
  }
}
