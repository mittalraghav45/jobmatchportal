import test from 'node:test';
import assert from 'node:assert/strict';

function score(job) {
  const t = [job.title, job.description].filter(Boolean).join(' ').toLowerCase();
  let s = 0;
  if (/\bjavascript\b/.test(t)) s += 20;
  if (/\btypescript\b/.test(t)) s += 20;
  if (/\breact\b/.test(t)) s += 20;
  if (/\b(node\.js|nodejs)\b/.test(t)) s += 15;
  if (/software engineer|software developer|frontend|full[- ]stack|web developer/.test(t)) s += 15;
  if (/junior|graduate|associate|mid[- ]level|engineer ii|developer ii/.test(t)) s += 5;
  if (['java', '.net', 'python', 'react native'].some(x => t.includes(x))) s -= 100;
  return s;
}

test('strong JS/TS/React role scores highly', () => {
  assert.equal(score({ title: 'Software Engineer', description: 'JavaScript TypeScript React Node.js' }), 90);
});

test('excluded stack is rejected', () => {
  assert.ok(score({ title: 'Software Engineer', description: 'Python React' }) < 50);
});
