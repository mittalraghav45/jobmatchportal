import { app } from '../server.js';
import aiRouter from './ai.js';
import intelligenceRouter from './intelligenceRoutes.js';

// server.js owns the core route registration. This module only mounts
// compatibility/optional routers used by the existing npm start scripts.
app.use('/api/ai', aiRouter);
app.use('/api/intelligence', intelligenceRouter);

console.log('APIs mounted: /api/jobs, /api/companies, /api/profile, /api/match, /api/applications, /api/discovery, /api/intelligence, /api/ai');
