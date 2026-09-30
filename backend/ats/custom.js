function cleanText(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(href, baseUrl) {
  try { return new URL(href, baseUrl).href; } catch { return null; }
}

function isLikelyJobUrl(url) {
  return /\/(job|jobs|careers|vacancy|vacancies|position|positions|opportunit|opening|role)[^/?#]*(?:\/|[?#]|$)/i.test(url);
}

function isLikelyJobTitle(text) {
  const value = cleanText(text);
  if (value.length < 3 || value.length > 180) return false;
  return /(engineer|developer|software|frontend|backend|full.?stack|data|product|designer|analyst|manager|specialist|consultant|recruiter|scientist|architect|devops|security|marketing|sales|operations|finance|legal|intern|graduate|director|lead|head|administrator|coordinator)/i.test(value);
}

function extractJsonLd(html, baseUrl) {
  const jobs = [];
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const raw = block.replace(/^.*?>/s, '').replace(/<\/script>.*$/is, '').trim();
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.itemListElement) ? parsed.itemListElement : [parsed];
      for (const item of items) {
        const value = item?.item || item;
        if (value?.['@type'] === 'JobPosting' || /jobposting/i.test(String(value?.['@type'] || ''))) {
          const url = absoluteUrl(value.url || value.sameAs, baseUrl);
          jobs.push({
            title: cleanText(value.title),
            location: cleanText(value.jobLocation?.address?.addressLocality || value.jobLocation?.address?.addressRegion || value.jobLocation?.name || 'UK'),
            description: cleanText(value.description).slice(0, 12000),
            url,
            posting_date: value.datePosted || null,
            closing_date: value.validThrough || null
          });
        }
      }
    } catch { /* Ignore malformed JSON-LD. */ }
  }
  return jobs;
}

export async function fetchCustomCareersPage(careersUrl, { companyId, companyName } = {}) {
  if (!careersUrl) return [];
  try {
    const response = await fetch(careersUrl, {
      headers: {
        'User-Agent': 'JobMatchPortal/1.0 (+job discovery)',
        Accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    if (!response.ok) return [];
    const html = await response.text();
    const jobs = extractJsonLd(html, careersUrl);

    const hrefRegex = /href=["']([^"'#]+)["'][^>]*>([\s\S]{2,500}?)<\/a>/gi;
    let match;
    while ((match = hrefRegex.exec(html)) && jobs.length < 200) {
      const url = absoluteUrl(match[1], careersUrl);
      const title = cleanText(match[2]);
      if (!url || !isLikelyJobUrl(url) || !isLikelyJobTitle(title)) continue;
      if (jobs.some(job => job.url === url)) continue;
      jobs.push({ title, location: 'UK', description: '', url, posting_date: null, closing_date: null });
    }

    return jobs.map((job, index) => ({
      id: `custom-${companyId || companyName || 'company'}-${index}-${encodeURIComponent(job.url || job.title)}`,
      title: job.title,
      location: job.location || 'UK',
      department: '',
      description: job.description || '',
      url: job.url,
      posting_date: job.posting_date || null,
      closing_date: job.closing_date || null,
      ats: 'custom',
      isTech: /(react|node|typescript|javascript|software|engineer|full.?stack|frontend|backend|web|developer|devops|data|cloud|security)/i.test(job.title || ''),
      source_verified: true
    }));
  } catch {
    return [];
  }
}
