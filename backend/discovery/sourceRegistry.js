import { createDiscoveryRegistry, discoverFromSources } from './sourceAdapter.js';

/**
 * Build the runtime discovery registry. Sources are explicitly supplied so
 * adding a connector never implicitly enables it in production.
 */
export function createJobDiscoveryRegistry(adapters = []) {
  return createDiscoveryRegistry(adapters);
}

export async function discoverJobs({ registry, sources, context = {} } = {}) {
  if (!registry || typeof registry.get !== 'function') {
    throw new TypeError('A discovery registry is required.');
  }

  return discoverFromSources(registry, sources, context);
}
