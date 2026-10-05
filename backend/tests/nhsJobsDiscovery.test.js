import test from 'node:test';
import assert from 'node:assert/strict';
import { createNhsJobsAdapter, parseNhsJobsFeed } from '../discovery/nhsJobs.js';

test('parses NHS Jobs RSS items into canonical jobs', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>Software Engineer</title>
    <employer>Example NHS Foundation Trust</employer>
    <location>Southampton</location>
    <description><![CDATA[React TypeScript Node.js]]></description>
    <guid>nhs-123</guid>
    <link>https://www.jobs.nhs.uk/candidate/jobadvert/nhs-123</link>
    <pubDate>Mon, 05 Oct 2026 09:00:00 GMT</pubDate>
    <contracttype>Permanent</contracttype>
  </item></channel></rss>`;

  const jobs = parseNhsJobsFeed(xml);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Software Engineer');
  assert.equal(jobs[0].companyName, 'Example NHS Foundation Trust');
  assert.equal(jobs[0].sourceJobId, 'nhs-123');
  assert.equal(jobs[0].metadata.publicSectorType, 'nhs');
});

test('NHS adapter fetches and normalizes an official-feed-shaped response', async () => {
  const xml = '<rss><channel><item><title>Frontend Developer</title><employer>NHS Trust</employer><location>UK</location><description>React</description><guid>x1</guid><link>https://www.jobs.nhs.uk/candidate/jobadvert/x1</link></item></channel></rss>';
  const adapter = createNhsJobsAdapter({
    feedUrl: 'https://example.test/nhs-feed',
    fetchImpl: async url => ({ ok: true, status: 200, text: async () => xml, requestedUrl: url })
  });

  const jobs = await adapter.discover();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source, 'public_sector');
  assert.equal(jobs[0].sourceKind, 'public_sector');
  assert.equal(jobs[0].title, 'Frontend Developer');
});

test('NHS adapter rejects failed feed responses', async () => {
  const adapter = createNhsJobsAdapter({
    feedUrl: 'https://example.test/nhs-feed',
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' })
  });

  await assert.rejects(() => adapter.discover(), /NHS Jobs feed request failed: 503/);
});
