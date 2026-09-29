import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_SECTOR_CV_SYSTEM_PROMPT, PUBLIC_SECTOR_CHECKLIST } from '../prompts/publicSectorPrompt.js';

test('public-sector prompt protects factual accuracy', () => {
  assert.match(PUBLIC_SECTOR_CV_SYSTEM_PROMPT, /Never invent experience/i);
  assert.match(PUBLIC_SECTOR_CV_SYSTEM_PROMPT, /Do not claim NHS\/public-sector experience/i);
  assert.match(PUBLIC_SECTOR_CV_SYSTEM_PROMPT, /verify it before submission/i);
});

test('public-sector prompt covers essential and desirable criteria', () => {
  assert.match(PUBLIC_SECTOR_CV_SYSTEM_PROMPT, /essential and desirable criteria/i);
  assert.ok(PUBLIC_SECTOR_CHECKLIST.includes('Essential criteria mapped to evidence'));
  assert.ok(PUBLIC_SECTOR_CHECKLIST.includes('Desirable criteria separated from essential criteria'));
});

test('public-sector guidance includes NHS-specific safeguards', () => {
  assert.match(PUBLIC_SECTOR_CV_SYSTEM_PROMPT, /clinical competence/i);
  assert.match(PUBLIC_SECTOR_CV_SYSTEM_PROMPT, /patient-facing experience/i);
});
