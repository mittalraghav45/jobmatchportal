import { JobSourceAdapter } from './sourceAdapter.js';

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function extractItems(xml) {
  const rssItems = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  if (rssItems.length) return rssItems;
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map(match => match[1]);
}

function entryLink(block) {
  const href = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
  if (href) return decodeXml(href[1]);
  return tagValue(block, 'link') || tagValue(block, 'guid');
}

export function parseNhsJobsFeed(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return [];

  return extractItems(xml).map(item => ({
    title: tagValue(item, 'title'),
    companyName: tagValue(item, 'employer') || tagValue(item, 'organisation') || tagValue(item, 'author'),
    location: tagValue(item, 'location') || tagValue(item, 'joblocation'),
    description: tagValue(item, 'description') || tagValue(item, 'summary') || tagValue(item, 'content'),
    applyUrl: entryLink(item),
    sourceJobId: tagValue(item, 'guid') || tagValue(item, 'id') || null,
    postedAt: tagValue(item, 'pubDate') || tagValue(item, 'published') || tagValue(item, 'updated') || null,
    employmentType: tagValue(item, 'contracttype') || tagValue(item, 'employmentType') || null,
    metadata: { publicSectorType: 'nhs' }
  })).filter(job => job.title && job.applyUrl);
}

export function createNhsJobsAdapter({ feedUrl, fetchImpl = globalThis.fetch } = {}) {
  if (!feedUrl) throw new TypeError('NHS Jobs adapter requires feedUrl.');
  if (typeof fetchImpl !== 'function') throw new TypeError('NHS Jobs adapter requires a fetch implementation.');

  return new JobSourceAdapter(
    'nhs',
    async context => {
      const url = typeof feedUrl === 'function' ? feedUrl(context) : feedUrl;
      const response = await fetchImpl(url, {
        headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }
      });
      if (!response.ok) throw new Error(`NHS Jobs feed request failed: ${response.status}`);
      return parseNhsJobsFeed(await response.text());
    },
    { kind: 'public_sector' }
  );
}
