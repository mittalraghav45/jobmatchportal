import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJobsAcUkSearchUrl, parseJobsAcUkHtml } from '../services/jobsAcUkSearch.js';

test('builds a paginated jobs.ac.uk search URL', () => {
  const url = buildJobsAcUkSearchUrl({ keywords: 'software engineer', location: 'Southampton', page: 2, pageSize: 50 });
  assert.match(url, /^https:\/\/www\.jobs\.ac\.uk\/search\/\?/);
  assert.match(url, /keywords=software\+engineer/);
  assert.match(url, /location=Southampton/);
  assert.match(url, /pageSize=50/);
  assert.match(url, /startIndex=51/);
});

test('parses jobs.ac.uk job links and de-duplicates them', () => {
  const html = `
    <div class="job-card">
      <a href="/job/12345/software-engineer">Software Engineer</a>
      <span>University of Southampton</span>
      <span>Location: Southampton</span>
      <span>Salary: £40,000 to £50,000</span>
      <span>Date Placed: 02 Oct</span>
      <span>Closes 20 Oct</span>
    </div>
    <div class="job-card">
      <a href="https://www.jobs.ac.uk/job/12345/software-engineer">Software Engineer</a>
    </div>
  `;

  const jobs = parseJobsAcUkHtml(html);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Software Engineer');
  assert.equal(jobs[0].externalId, jobs[0].url);
  assert.equal(jobs[0].ats, 'jobs-ac-uk');
  assert.equal(jobs[0].source, 'jobs.ac.uk');
});
