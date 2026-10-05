import jobsRouter from './jobs.js';
import jobsAcUkRouter from './jobsAcUkRoutes.js';
import companiesRouter from './companies.js';
import candidateProfileRouter from './candidateProfile.js';

export function registerCoreRoutes(app) {
  app.use('/api/jobs', jobsRouter);
  app.use('/api/jobs-ac-uk', jobsAcUkRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/profile', candidateProfileRouter);
}
