import test from 'node:test';
import assert from 'node:assert/strict';
import { isUkJobLocation, resolveUkJobLocation, ukJobMongoFilter } from '../utils/ukJobLocation.js';

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

test('rejects foreign office locations even when the country is omitted', () => {
  assert.equal(isUkJobLocation('New York Office'), false);
  assert.equal(isUkJobLocation('San Francisco Office'), false);
  assert.equal(isUkJobLocation('New York, United States'), false);
});

test('uses fallback country only when the primary location is missing', () => {
  assert.deepEqual(resolveUkJobLocation('', 'United Kingdom'), {
    status: 'confirmed_uk',
    evidenceSource: 'fallback_country',
    value: 'United Kingdom'
  });
  assert.equal(resolveUkJobLocation('New York Office', 'United Kingdom').status, 'non_uk');
});

test('distinguishes unresolved location from confirmed UK location', () => {
  assert.equal(resolveUkJobLocation('Remote').status, 'unknown');
  assert.equal(resolveUkJobLocation('London').status, 'confirmed_uk');
});

test('Mongo filter requires UK evidence and excludes non-UK country/city evidence', () => {
  const filter = ukJobMongoFilter();
  assert.ok(filter.$and, 'filter should use an explicit allow-and-deny structure');
  assert.ok(filter.$and.some(clause => clause.location?.$regex), 'filter should contain UK location evidence');
  assert.ok(filter.$and.some(clause => clause.location?.$not?.$regex), 'filter should contain non-UK exclusions');
});
