import { app } from '../server.js';
import aiRouter from './ai.js';
import sourceHealthRouter from './sourceHealth.js';

// server.js owns all core API registration. This file remains the
// compatibility entrypoint used by the existing npm scripts.
app.use('/api/ai', aiRouter);
app.use('/api/discovery/source-health', sourceHealthRouter);

console.log('APIs mounted by server.js: /api/jobs, /api/companies, /api/profile, /api/match, /api/applications, /api/discovery, /api/intelligence');
console.log('Compatibility APIs mounted: /api/ai, /api/discovery/source-health');
