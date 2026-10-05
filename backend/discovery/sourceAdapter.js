export class JobSourceAdapter {
  constructor(name, discoverFn, { kind = 'generic' } = {}) {
    if (!name || typeof discoverFn !== 'function') {
      throw new TypeError('Job source adapter requires a name and discover function.');
    }
    this.name = name;
    this.kind = kind;
    this.discoverFn = discoverFn;
  }

  async discover(context = {}) {
    const jobs = await this.discoverFn(context);
    if (!Array.isArray(jobs)) return [];
    return jobs.map(job => normalizeDiscoveredJob(job, this.name, this.kind));
  }
}

export function normalizeDiscoveredJob(job, source, sourceKind = 'generic') {
  if (!job || typeof job !== 'object') throw new TypeError('Discovered job must be an object.');

  const title = String(job.title ?? '').trim();
  const applyUrl = String(job.applyUrl ?? job.url ?? '').trim();
  if (!title || !applyUrl) {
    throw new TypeError('Discovered job requires title and applyUrl.');
  }

  return {
    title,
    companyName: String(job.companyName ?? job.organisation ?? '').trim(),
    location: String(job.location ?? '').trim(),
    description: String(job.description ?? '').trim(),
    applyUrl,
    source,
    sourceKind,
    sourceJobId: job.sourceJobId ?? job.id ?? null,
    employmentType: job.employmentType ?? null,
    workMode: job.workMode ?? null,
    postedAt: job.postedAt ?? null,
    metadata: job.metadata && typeof job.metadata === 'object' ? job.metadata : {}
  };
}

export function createDiscoveryRegistry(adapters = []) {
  return new Map(adapters.map(adapter => [adapter.name, adapter]));
}

export async function discoverFromSources(registry, sourceNames, context = {}) {
  const names = sourceNames?.length ? sourceNames : [...registry.keys()];
  const jobs = [];

  for (const name of names) {
    const adapter = registry.get(name);
    if (!adapter) throw new Error(`Unknown job source: ${name}`);
    jobs.push(...await adapter.discover(context));
  }

  return jobs;
}
