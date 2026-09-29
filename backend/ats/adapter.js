export class ATSAdapter {
  constructor(name, discoverFn) {
    if (!name || typeof discoverFn !== 'function') throw new TypeError('ATS adapter requires a name and discover function.');
    this.name = name;
    this.discoverFn = discoverFn;
  }

  async discover(context = {}) {
    const jobs = await this.discoverFn(context);
    return Array.isArray(jobs) ? jobs : [];
  }
}

export function createATSRegistry(adapters = []) {
  return new Map(adapters.map(adapter => [adapter.name, adapter]));
}
