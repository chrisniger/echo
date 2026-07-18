import type { WsGateway } from './gateway.js';

/**
 * Module-level holder for the WsGateway instance. Mirrors the `getDb()`
 * singleton pattern so route handlers can publish WS events without
 * threading the gateway through every Router factory call.
 *
 * Init contract: `setWsGateway()` MUST be called once during server startup,
 * before the HTTP server starts accepting requests. `getWsGateway()` throws
 * if accessed before init — a deliberate fail-loud.
 */
let instance: WsGateway | null = null;

export function setWsGateway(gateway: WsGateway): void {
  instance = gateway;
}

export function getWsGateway(): WsGateway {
  if (!instance) {
    throw new Error(
      'WsGateway not initialized — call setWsGateway(gateway) during server startup before routes are mounted.',
    );
  }
  return instance;
}
