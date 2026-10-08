import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectMongo, disconnectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { Application } from '../models/Application.js';

// Always create a fresh ephemeral MongoDB; never use a supplied production URI.
export async function startIsolatedServer(port = 0) {
  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { args: ['--nounixsocket'] } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB_NAME = 'jobmatchportal_test';
  await connectMongo();
  await Company.create([
    { companyId: 'test-university', companyName: 'Test University', employerType: 'universities', sponsorship: 'verified' },
    { companyId: 'test-private', companyName: 'Test Private', sponsorship: 'not-sponsor' }
  ]);
  await CandidateProfile.create({ profileId: 'default', name: 'Test candidate', skills: ['react', 'typescript', 'javascript'], yearsExperience: 3, cvText: 'Frontend software engineer. React TypeScript JavaScript.' });
  const base = { schemaVersion: 'v1', companyId: 'test-university', title: 'Frontend Software Engineer', description: 'Essential criteria: React, TypeScript, JavaScript.', location: 'Belfast, Northern Ireland', employerType: 'universities', status: { isLive: true }, verification: { status: 'live' }, processing: { status: 'complete' }, applyUrl: 'https://example.com/jobs/test', source: { ats: 'test', url: 'https://example.com/jobs/test' } };
  const cases = [
    ['eligible', {}],
    ['wrong-city', { location: 'London, UK' }],
    ['wrong-category', { title: 'Backend Software Engineer' }],
    ['not-sponsor', { companyId: 'test-private', employerType: 'private' }],
    ['orphan', { companyId: 'missing-company', employerType: 'private' }],
    ['unknown', { verification: { status: 'unknown' } }],
    ['closed', { status: { isLive: false }, verification: { status: 'closed' } }],
    ['inconsistent-live', { status: { isLive: false } }],
    ['unprocessed', { processing: { status: 'failed' } }],
    ['no-url', { applyUrl: '' }],
    ['foreign', { location: 'Helsinki, Finland' }]
  ];
  const jobs = await Job.create(cases.map(([id, extra]) => ({ ...base, fingerprint: id, ...extra, source: { ats: 'test', url: `https://example.com/jobs/${id}` } })));
  await Application.init();
  process.env.NODE_ENV = 'test';
  const { app } = await import('../server.js');
  const server = await new Promise(resolve => { const listener = app.listen(port, '127.0.0.1', () => resolve(listener)); });
  return { url: `http://127.0.0.1:${server.address().port}`, jobs, close: async () => { await new Promise(resolve => server.close(resolve)); await disconnectMongo(); await mongo.stop(); } };
}
