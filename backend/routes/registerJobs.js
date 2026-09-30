import { app } from '../server.js';
import jobsRouter from './jobs.js';

// Mount the MongoDB-backed jobs API after the existing server module is loaded.
// Express applications remain mutable after listen(), so this keeps server.js
// stable while allowing the jobs API to evolve independently.
app.use('/api/jobs', jobsRouter);

console.log('MongoDB jobs API mounted at /api/jobs');
