import jobsRouter from './jobs.js';
import companiesRouter from './companies.js';
import candidateProfileRouter from './candidateProfile.js';

export function registerCoreRoutes(app) {
  app.use('/api/jobs', jobsRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/profile', candidateProfileRouter);
}
