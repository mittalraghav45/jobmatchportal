import { app } from '../server.js';
import aiRouter from './ai.js';

// server.js owns all core API registration. This file remains as the
// compatibility entrypoint used by the existing npm scripts.
app.use('/api/ai', aiRouter);

console.log('APIs mounted by server.js: /api/jobs, /api/companies, /api/profile, /api/match, /api/applications, /api/discovery, /api/intelligence');
console.log('Compatibility API mounted: /api/ai');
