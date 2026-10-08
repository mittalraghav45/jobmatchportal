import { startIsolatedServer } from './isolatedServer.js';
const fixture = await startIsolatedServer(3001);
console.log('Isolated test API listening on ' + fixture.url);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await fixture.close(); process.exit(0); });
