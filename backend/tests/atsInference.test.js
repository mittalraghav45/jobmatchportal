import test from 'node:test';
import assert from 'node:assert/strict';
import { inferAtsFromUrl } from '../services/serperJobDiscovery.js';

test('infers ATS from direct job posting hosts', () => {
  assert.equal(inferAtsFromUrl('https://jobs.lever.co/example/123'), 'lever');
  assert.equal(inferAtsFromUrl('https://job-boards.greenhouse.io/example/jobs/456'), 'greenhouse');
  assert.equal(inferAtsFromUrl('https://jobs.ashbyhq.com/example/abc123'), 'ashby');
  assert.equal(inferAtsFromUrl('https://apply.workable.com/example/j/abc123/'), 'workable');
  assert.equal(inferAtsFromUrl('https://jobs.smartrecruiters.com/Example/123'), 'smartrecruiters');
  assert.equal(inferAtsFromUrl('https://example.myworkdayjobs.com/en-US/example/job/Software-Engineer_R123'), 'workday');
});

test('does not mistake generic employer pages for an ATS', () => {
  assert.equal(inferAtsFromUrl('https://example.com/careers/software-engineer'), 'unknown');
});
