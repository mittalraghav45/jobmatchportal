import { app } from '../server.js';
import { registerCoreRoutes } from './registerCoreRoutes.js';
import matchRouter from './match.js';

// Route registration is kept outside server.js so the application bootstrap
// remains stable while API modules evolve independently.
registerCoreRoutes(app);
app.use('/api/match', matchRouter);

console.log('Core MongoDB APIs mounted: /api/jobs, /api/companies, /api/profile, /api/match');
