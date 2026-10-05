import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJobsAcUkSearchUrl, parseJobsAcUkHtml } from '../services/jobsAcUkSearch.js';

test('builds a paginated jobs.ac.uk search URL with source-side discipline facets', () => {
  const url = buildJobsAcUkSearchUrl({ keywords: 'software engineer', location: 'Southampton', discipline: 'computer-sciences', subDiscipline: 'software-engineering', page: 2, pageSize: 50 });
  assert.match(url, /^https:\/\/www\.jobs\.ac\.uk\/search\/\?/);
  assert.match(url, /keywords=software\+engineer/);
  assert.match(url, /location=Southampton/);
  assert.match(url, /academicDisciplineFacet%5B0%5D=computer-sciences/);
  assert.match(url, /subDisciplineFacet%5B0%5D=software-engineering/);
  assert.match(url, /pageSize=50/);
  assert.match(url, /startIndex=51/);
});

test('parses one listing without leaking neighbouring jobs into the record', () => {
  const html = `
    <div class="job-card"><a href="/job/DTB844/dri-community-coordinator">DRI Community Coordinator</a><div>Computer Science</div><div>Durham University</div><div>Location: Durham</div><div>Salary: £27,319 to £30,378</div><div>Date Placed: 28 Sep</div><div>Closes 12 Oct</div><div>Save</div></div>
    <div class="job-card"><a href="/job/DTB823/research-fellow">Research Fellow</a><div>Institute of Ophthalmology / Department of Medical Physics &amp; Biomedical Engineering</div><div>UCL</div><div>Location: London</div><div>Salary: £45,103</div><div>Date Placed: 28 Sep</div><div>Closes 11 Oct</div></div>`;
  const jobs = parseJobsAcUkHtml(html);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, 'DRI Community Coordinator');
  assert.equal(jobs[0].companyName, 'Durham University');
  assert.equal(jobs[0].department, 'Computer Science');
  assert.equal(jobs[0].location, 'Durham');
  assert.equal(jobs[0].salary, '£27,319 to £30,378');
  assert.equal(jobs[0].posting_date, '28 Sep');
  assert.equal(jobs[0].closing_date, '12 Oct');
  assert.equal(jobs[0].description, '');
  assert.equal(jobs[0].externalId, jobs[0].url);
  assert.equal(jobs[0].ats, 'jobs-ac-uk');
  assert.equal(jobs[0].source, 'jobs.ac.uk');
  assert.equal(jobs[0].source_verified, true);
  assert.equal(jobs[1].title, 'Research Fellow');
  assert.equal(jobs[1].companyName, 'UCL');
  assert.equal(jobs[1].department, 'Institute of Ophthalmology / Department of Medical Physics & Biomedical Engineering');
  assert.equal(jobs[1].location, 'London');
  assert.equal(jobs[1].salary, '£45,103');
});

test('de-duplicates the same jobs.ac.uk URL', () => {
  const html = `<div class="job-card"><a href="/job/12345/software-engineer">Software Engineer</a><div>University of Southampton</div><div>Location: Southampton</div></div><div class="job-card"><a href="https://www.jobs.ac.uk/job/12345/software-engineer">Software Engineer</a></div>`;
  assert.equal(parseJobsAcUkHtml(html).length, 1);
});
