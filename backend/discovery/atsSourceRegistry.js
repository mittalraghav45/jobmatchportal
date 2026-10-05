import { createJobDiscoveryRegistry, discoverJobs } from './sourceRegistry.js';
import { atsRegistry } from '../ats/registry.js';

/**
 * Explicitly enabled ATS sources for discovery. The underlying ATS registry
 * contains supported adapters; this bridge prevents accidental activation of
 * every adapter in production.
 */
export const DEFAULT_ATS_DISCOVERY_SOURCES = [
  'greenhouse',
  'lever',
  'ashby'
];

export function createAtsDiscoveryRegistry(sourceNames = DEFAULT_ATS_DISCOVERY_SOURCES) {
  const adapters = sourceNames.map((name) => {
    const key = String(name || '').trim().toLowerCase();
    const adapter = atsRegistry.get(key);
    if (!adapter) throw new Error(`Unsupported ATS discovery source: ${name}`);
    return {
      name: key,
      discover: (context = {}) => adapter.discover(context)
    };
  });
  return createJobDiscoveryRegistry(adapters);
}

export async function discoverAtsJobs({ sources = DEFAULT_ATS_DISCOVERY_SOURCES, context = {} } = {}) {
  const registry = createAtsDiscoveryRegistry(sources);
  return discoverJobs({ registry, sources, context });
}
