import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNation } from '../utils/jobClassification.js';

test('specific job location wins over company location', () => {
  assert.equal(
    classifyNation({
      location: 'Cardiff, Wales',
      company: { metadata: { location: 'London, England' } }
    }),
    'Wales'
  );
});

test('UK company metadata does not become England by default', () => {
  assert.equal(
    classifyNation({
      location: 'UK',
      company: { metadata: { country: 'United Kingdom', location: 'UK' } }
    }),
    'UK-wide'
  );
});

test('explicit England company metadata is accepted when job location is generic', () => {
  assert.equal(
    classifyNation({
      location: 'UK',
      company: { metadata: { country: 'England' } }
    }),
    'England'
  );
});

test('Scotland location is classified correctly', () => {
  assert.equal(classifyNation({ location: 'Glasgow, Scotland' }), 'Scotland');
});

test('Wales location is classified correctly', () => {
  assert.equal(classifyNation({ location: 'Swansea, Wales' }), 'Wales');
});

test('Northern Ireland location is classified correctly', () => {
  assert.equal(classifyNation({ location: 'Belfast, Northern Ireland' }), 'Northern Ireland');
});

test('England location is classified correctly', () => {
  assert.equal(classifyNation({ location: 'Southampton, England' }), 'England');
});
