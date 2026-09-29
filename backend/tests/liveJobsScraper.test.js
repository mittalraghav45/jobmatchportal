import assert from 'node:assert/strict';
import { enrichWithDates } from '../liveJobsScraper_new.js';

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

const jobs = enrichWithDates([
  { id: '1', title: 'Future job', posting_date: past, closing_date: future },
  { id: '2', title: 'Open job without close date', posting_date: past },
  { id: '3', title: 'Closed job', posting_date: past, closing_date: past }
]);

assert.equal(jobs[0].isLive, true);
assert.equal(jobs[0].daysUntilClose, 1);
assert.equal(jobs[1].isLive, true);
assert.equal(jobs[1].closing_date, null);
assert.equal(jobs[1].daysUntilClose, null);
assert.equal(jobs[2].isLive, false);
assert.ok(jobs.every(j => j.lastVerifiedAt));

console.log('PASS liveJobsScraper tests');
