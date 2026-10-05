import test from 'node:test';
import assert from 'node:assert/strict';
import { isUkJobLocation, ukJobMongoFilter } from '../utils/ukJobLocation.js';

test('accepts explicit UK locations', () => {
  assert.equal(isUkJobLocation('London, United Kingdom'), true);
  assert.equal(isUkJobLocation('Manchester, UK'), true);
  assert.equal(isUkJobLocation('Remote - UK'), true);
});

test('rejects non-UK countries including Finland', () => {
  assert.equal(isUkJobLocation('Finland'), false);
  assert.equal(isUkJobLocation('Helsinki, Finland'), false);
  assert.equal(isUkJobLocation('London, Finland'), false);
  assert.equal(isUkJobLocation('Stockholm, Sweden'), false);
});

test('Mongo filter requires UK evidence and excludes non-UK country evidence', () => {
  const filter = ukJobMongoFilter();
  assert.ok(filter.$and, 'filter should use an explicit allow-and-deny structure');
  assert.ok(filter.$and.some(clause => clause.location?.$regex), 'filter should contain UK location evidence');
  assert.ok(filter.$and.some(clause => clause.location?.$not?.$regex), 'filter should contain a non-UK exclusion');
});
