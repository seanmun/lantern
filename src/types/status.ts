/** /status: health of the chain and the services around it. */

export type ServiceState = 'up' | 'degraded' | 'down';

export interface ServiceStatus {
  id: string;
  group: string;            // 'PulseChain', 'Ethereum', 'Base', 'Price data'
  name: string;
  state: ServiceState;
  detail: string;
  latencyMs: number | null;
}

export interface StatusReport {
  checkedAt: number;
  chain: { producingBlocks: boolean; lastBlock: number | null; lastBlockAt: number | null };
  services: ServiceStatus[];
}
