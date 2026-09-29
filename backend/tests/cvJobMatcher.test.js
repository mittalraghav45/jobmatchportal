import assert from 'node:assert/strict';
import {
  parseCV,
  calculateMatchPercent,
  getMatchBreakdown,
  getRecommendation,
  generateLatexCV,
  generateCoverLetter
} from '../cvJobMatcher.js';

const cv = parseCV(`
Raghav Mittal
Software Engineer
2.5 years experience
React.js, TypeScript, JavaScript, Node.js, PostgreSQL, MongoDB, AWS, Jest, Playwright
`);

assert.equal(cv.name, 'Raghav Mittal');
assert.ok(cv.skills.includes('react'));
assert.ok(cv.skills.includes('typescript'));
assert.ok(cv.skills.includes('node.js'));
assert.equal(cv.years, 2.5);

const job = 'Software Engineer. React, TypeScript, Node.js and AWS experience required.';
const score = calculateMatchPercent(cv.skills, job, 'Software Engineer');
assert.ok(score >= 60 && score <= 100, `unexpected score: ${score}`);

const breakdown = getMatchBreakdown(cv.skills, job, 'Software Engineer');
assert.ok(breakdown.matchedSkills.includes('react'));
assert.ok(breakdown.matchedSkills.includes('typescript'));
assert.equal(breakdown.roleAlignment, true);
assert.equal(breakdown.score, score);

const closed = getRecommendation(95, true, new Date(Date.now() - 86400000).toISOString(), true);
assert.equal(closed.shouldApply, false);
assert.equal(closed.priority, 'Closed');

const noSponsor = getRecommendation(95, true, null, false);
assert.equal(noSponsor.shouldApply, false);
assert.equal(noSponsor.priority, 'Sponsorship');

const good = getRecommendation(85, true, null, true);
assert.equal(good.shouldApply, true);
assert.equal(good.priority, 'High');

const latex = generateLatexCV({
  companyName: 'Example & Co',
  role: 'Software Engineer',
  jobDescription: job,
  cvSkills: cv.skills
});
assert.match(latex, /Example \\& Co/);
assert.match(latex, /Software Engineer/);
assert.match(latex, /Relevant to this vacancy/);

const letter = generateCoverLetter({
  companyName: 'Example & Co',
  role: 'Software Engineer',
  location: 'London'
});
assert.match(letter, /Example & Co/);
assert.match(letter, /Software Engineer/);
assert.doesNotMatch(letter, /undefined|null/);

console.log('PASS cvJobMatcher tests');
