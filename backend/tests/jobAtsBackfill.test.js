import test from 'node:test';
import assert from 'node:assert/strict';
import { inferAtsFromUrl } from '../services/serperJobDiscovery.js';

test('infers ATS from supported job URLs for backfill', () => {
  assert.equal(inferAtsFromUrl('https://jobs.lever.co/acme/123'), 'lever');
  assert.equal(inferAtsFromUrl('https://job-boards.greenhouse.io/acme/jobs/123'), 'greenhouse');
  assert.equal(inferAtsFromUrl('https://jobs.ashbyhq.com/acme/123'), 'ashby');
  assert.equal(inferAtsFromUrl('https://acme.myworkdayjobs.com/en-US/careers/job/job-title_123'), 'workday');
});

test('leaves unsupported URLs as unknown', () => {
  assert.equal(inferAtsFromUrl('https://example.com/careers/software-engineer'), 'unknown');
});
