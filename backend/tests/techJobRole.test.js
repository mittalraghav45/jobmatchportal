import test from 'node:test';
import assert from 'node:assert/strict';
import { isTechJobTitle, techJobMongoFilter } from '../utils/techJobRole.js';

test('accepts common technology roles', () => {
  const titles = [
    'Software Engineer',
    'Frontend Developer',
    'Full-Stack Engineer',
    'DevOps Engineer',
    'Data Scientist',
    'AI Engineer',
    'Cybersecurity Analyst',
    'Technical Architect'
  ];

  for (const title of titles) assert.equal(isTechJobTitle(title), true, title);
});

test('rejects explicit non-technology roles even when generic tech words appear', () => {
  const titles = [
    'Sales Development Representative',
    'Technical Account Manager',
    'Product Manager',
    'Engineering Recruitment Manager',
    'Customer Success Manager - Software'
  ];

  for (const title of titles) assert.equal(isTechJobTitle(title), false, title);
});

test('mongo filter contains both technology inclusion and non-technology exclusion', () => {
  const filter = techJobMongoFilter();
  assert.ok(Array.isArray(filter.$and));
  assert.equal(filter.$and.length, 2);
  assert.ok(Array.isArray(filter.$and[0].$or));
  assert.ok(Array.isArray(filter.$and[1].$nor));
  assert.ok(filter.$and[0].$or.length >= 15);
  assert.ok(filter.$and[1].$nor.length >= 10);
});
