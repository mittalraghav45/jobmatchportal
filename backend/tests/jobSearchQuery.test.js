import test from 'node:test';
import assert from 'node:assert/strict';
import { addJobSearchFilters } from '../utils/jobSearchFilters.js';
import { isUkJobLocation } from '../utils/ukJobLocation.js';

test('city matches whole names and escapes regular expression input', () => {
  const filter = { $and: [] };
  addJobSearchFilters(filter, { city: 'York' });
  const query = filter.$and[0].location;
  const pattern = new RegExp(query.$regex, query.$options);
  assert.equal(pattern.test('York, UK'), true);
  assert.equal(pattern.test('Yorkshire, UK'), false);
  const special = { $and: [] };
  addJobSearchFilters(special, { city: 'London.*' });
  assert.equal(new RegExp(special.$and[0].location.$regex, 'i').test('London, UK'), false);
});

test('role categories use title evidence and reject unsupported input', () => {
  const filter = { $and: [] };
  addJobSearchFilters(filter, { category: 'frontend' });
  const pattern = new RegExp(filter.$and[0].title.$regex, 'i');
  assert.equal(pattern.test('Frontend Engineer'), true);
  assert.equal(pattern.test('Backend Engineer'), false);
  assert.throws(() => addJobSearchFilters({ $and: [] }, { category: 'invalid' }), { code: 'INVALID_CATEGORY' });
});

test('Northern Ireland is UK eligible while Republic of Ireland remains excluded', () => {
  assert.equal(isUkJobLocation('Belfast, Northern Ireland'), true);
  assert.equal(isUkJobLocation('Dublin, Ireland'), false);
  assert.equal(isUkJobLocation('Belfast, Northern Ireland / Dublin, Ireland'), false);
});
