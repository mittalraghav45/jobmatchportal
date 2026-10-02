import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleQuery, buildGoogleSearchUrl, classifyDiscoveredUrl, extractJobPostingJsonLd, extractLinks, chooseCrawlTargets, isCrawlableTarget, normaliseUrl } from '../services/googleCareersCrawler.js';

test('builds a company-scoped Google careers query', () => {
  const query = buildGoogleQuery('Example Ltd', 'private');
  assert.match(query, /Example Ltd/);
  assert.match(query, /jobs careers/);
  assert.match(buildGoogleSearchUrl('Example Ltd'), /^https:\/\/www\.google\.com\/search\?q=/);
});

test('classifies company careers and ATS job URLs', () => {
  assert.equal(classifyDiscoveredUrl('https://example.com/careers', 'example.com'), 'careers');
  assert.equal(classifyDiscoveredUrl('https://example.com/jobs/software-engineer', 'example.com'), 'job');
  assert.equal(classifyDiscoveredUrl('https://jobs.ashbyhq.com/example/123', 'example.com'), 'ats_job');
  assert.equal(classifyDiscoveredUrl('https://example.com/about', 'example.com'), 'other');
});

test('extracts relevant links and ignores unrelated links', () => {
  const html = '<a href="/careers">Careers</a><a href="/jobs/123">Software Engineer</a><a href="/privacy">Privacy</a>';
  const links = extractLinks(html, 'https://example.com', 'example.com');
  assert.equal(links.length, 2);
  assert.deepEqual(links.map(x => x.kind), ['careers', 'job']);
});

test('unwraps Google result redirect links to the actual careers/ATS URL', () => {
  const html = '<a href="/url?q=https%3A%2F%2Fjobs.ashbyhq.com%2Fexample%2F123&sa=U">Software Engineer</a>';
  const links = extractLinks(html, 'https://www.google.com/search?q=Example', 'example.com');
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://jobs.ashbyhq.com/example/123');
  assert.equal(links[0].kind, 'ats_job');
});

test('extracts JobPosting JSON-LD from a single job page', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Software Engineer', datePosted: '2026-10-01', url: 'https://example.com/jobs/1' })}</script>`;
  const jobs = extractJobPostingJsonLd(html);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Software Engineer');
});

test('supports JobPosting entries inside @graph', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Organization' }, { '@type': 'JobPosting', title: 'Frontend Engineer' }] })}</script>`;
  assert.equal(extractJobPostingJsonLd(html)[0].title, 'Frontend Engineer');
});

test('prioritises individual jobs and ATS jobs over generic careers pages', () => {
  const targets = chooseCrawlTargets([
    { url: 'https://example.com/careers', kind: 'careers' },
    { url: 'https://jobs.ashbyhq.com/example/1', kind: 'ats_job' },
    { url: 'https://example.com/jobs/1', kind: 'job' }
  ], 3);
  assert.deepEqual(targets.map(x => x.kind), ['ats_job', 'job', 'careers']);
});

test('deduplicates crawl targets and keeps the crawl bounded', () => {
  const targets = chooseCrawlTargets([
    { url: 'https://example.com/careers', kind: 'careers' },
    { url: 'https://example.com/careers', kind: 'careers' },
    { url: 'https://jobs.ashbyhq.com/example/1', kind: 'ats_job' },
    { url: 'https://jobs.ashbyhq.com/example/2', kind: 'ats_job' }
  ], 2);
  assert.equal(targets.length, 2);
  assert.deepEqual(targets.map(x => x.kind), ['ats_job', 'ats_job']);
  assert.equal(new Set(targets.map(x => x.url)).size, 2);
});

test('only crawls recognised careers and ATS targets', () => {
  assert.equal(isCrawlableTarget({ url: 'https://example.com/careers', kind: 'careers' }, 'example.com'), true);
  assert.equal(isCrawlableTarget({ url: 'https://jobs.ashbyhq.com/example/1', kind: 'ats_job' }, 'example.com'), true);
  assert.equal(isCrawlableTarget({ url: 'https://example.com/about', kind: 'other' }, 'example.com'), false);
  assert.equal(isCrawlableTarget({ url: 'javascript:void(0)', kind: 'careers' }, 'example.com'), false);
});

test('normalises fragments without changing the source identity', () => {
  assert.equal(normaliseUrl('https://example.com/jobs/1#apply'), 'https://example.com/jobs/1');
});
