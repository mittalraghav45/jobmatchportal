const CLOSED_PATTERNS = [
  /applications?\s+(?:are\s+)?closed/i,
  /no longer accepting applications/i,
  /this role is no longer accepting/i,
  /this (?:job|role|position|vacancy) (?:is|has been) closed/i,
  /(?:job|role|position|vacancy) has expired/i,
  /position has been filled/i,
  /applications? (?:have|has) closed/i,
  /this job is no longer available/i,
  /no longer available for applications/i
];

const LIVE_PATTERNS = [
  /apply now/i,
  /submit application/i,
  /applications? (?:are|is) open/i,
  /apply for this (?:job|role|position)/i
];

function firstUrl(job) {
  const values = [
    job?.source?.url,
    job?.applicationUrl,
    job?.application_url,
    job?.url,
    job?.raw?.applicationUrl,
    job?.raw?.application_url,
    job?.raw?.url
  ];
  return values.find(value => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))?.trim() || '';
}

function closingDateFromKnownFields(job) {
  const value = job?.dates?.closingAt || job?.closingAt || job?.closing_date || null;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferClosingDate(text) {
  const patterns = [
    /(?:application|applications|closing|deadline|closing date)[^\n]{0,100}?\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\b/i,
    /(?:application|applications|closing|deadline|closing date)[^\n]{0,100}?\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i,
    /(?:application|applications|closing|deadline|closing date)[^\n]{0,100}?\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = match[1].replace(/\./g, '/');
    let date = new Date(raw);
    if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(raw)) {
      const [day, month, year] = raw.split(/[\/.-]/).map(Number);
      date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
    }
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function classifyHtml(html) {
  const text = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  for (const pattern of CLOSED_PATTERNS) {
    if (pattern.test(text)) return { state: 'closed', reason: `source_text:${pattern.source}` };
  }
  for (const pattern of LIVE_PATTERNS) {
    if (pattern.test(text)) return { state: 'live', reason: `source_text:${pattern.source}` };
  }
  return { state: 'unknown', reason: 'no_explicit_live_or_closed_signal' };
}

export async function verifyJobLiveStatus(job, { timeoutMs = 10000, now = new Date() } = {}) {
  const knownClosingDate = closingDateFromKnownFields(job);
  if (knownClosingDate && knownClosingDate.getTime() < now.getTime()) {
    return {
      state: 'closed',
      isLive: false,
      reason: 'closing_date_passed',
      checkedAt: now.toISOString(),
      url: firstUrl(job),
      closingAt: knownClosingDate.toISOString()
    };
  }

  const url = firstUrl(job);
  if (!url) {
    return { state: 'unknown', isLive: null, reason: 'no_source_url', checkedAt: now.toISOString(), url: '' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'UKJobMatchPortal/1.0 (+job-live-verification)',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
      }
    });

    if (response.status === 404 || response.status === 410) {
      return { state: 'closed', isLive: false, reason: `http_${response.status}`, checkedAt: now.toISOString(), url: response.url || url };
    }
    if (!response.ok) {
      return { state: 'unknown', isLive: null, reason: `http_${response.status}`, checkedAt: now.toISOString(), url: response.url || url };
    }

    const html = await response.text();
    const classification = classifyHtml(html);
    const pageClosingDate = inferClosingDate(html);
    const closingAt = pageClosingDate || knownClosingDate;

    if (closingAt && closingAt.getTime() < now.getTime()) {
      return {
        state: 'closed',
        isLive: false,
        reason: 'closing_date_passed_on_source',
        checkedAt: now.toISOString(),
        url: response.url || url,
        closingAt: closingAt.toISOString()
      };
    }

    return {
      ...classification,
      isLive: classification.state === 'live' ? true : classification.state === 'closed' ? false : null,
      checkedAt: now.toISOString(),
      url: response.url || url,
      closingAt: closingAt ? closingAt.toISOString() : null
    };
  } catch (error) {
    return {
      state: 'unknown',
      isLive: null,
      reason: error.name === 'AbortError' ? 'request_timeout' : `request_error:${error.code || error.name || 'unknown'}`,
      checkedAt: now.toISOString(),
      url
    };
  } finally {
    clearTimeout(timer);
  }
}
