import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverNhsJobs } from '../discovery/nhsImport.js';

const feed = `<?xml version="1.0"?><rss><channel>
  <item><title>Software Engineer</title><employer>NHS Example Trust</employer><location>Leeds</location><description>React TypeScript</description><guid>nhs-1</guid><link>https://example.test/1</link></item>
  <item><title>Developer</title><employer>NHS Example Trust</employer><location>Manchester</location><guid>nhs-2</guid><link>https://example.test/2</link></item>
  <item><title>Analyst</title><employer>NHS Example Trust</employer><location>London</location><guid>nhs-3</guid><link>https://example.test/3</link></item>
</channel></rss>`;

test('bounds NHS discovery before persistence', async () => {
  const jobs = await discoverNhsJobs({
    feedUrl: 'https://example.test/nhs.xml',
    limit: 2,
    fetchImpl: async () => ({ ok: true, text: async () => feed })
  });

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].source, 'nhs');
  assert.equal(jobs[0].sourceKind, 'public_sector');
  assert.equal(jobs[0].metadata.publicSectorType, 'nhs');
  assert.equal(jobs[1].sourceJobId, 'nhs-2');
});

test('rejects unsafe discovery limits', async () => {
  await assert.rejects(
    () => discoverNhsJobs({ feedUrl: 'https://example.test/nhs.xml', limit: 501 }),
    /between 1 and 500/
  );
});
