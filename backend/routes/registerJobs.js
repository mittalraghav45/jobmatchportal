import { app } from '../server.js';
import { registerCoreRoutes } from './registerCoreRoutes.js';
import matchRouter from './match.js';
import applicationsRouter from './applications.js';

// Route registration is kept outside server.js so the application bootstrap
// remains stable while API modules evolve independently.
registerCoreRoutes(app);
app.use('/api/match', matchRouter);
app.use('/api/applications', applicationsRouter);

console.log('Core APIs mounted: /api/jobs, /api/companies, /api/profile, /api/match, /api/applications');
