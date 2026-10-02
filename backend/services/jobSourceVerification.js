const DEFAULT_TIMEOUT_MS = 12000;

const CLOSED_PATTERNS = [
  /job\s+(?:is\s+)?(?:closed|no longer available|no longer accepting)/i,
  /vacancy\s+(?:is\s+)?(?:closed|no longer available|closed to applications)/i,
  /position\s+(?:is\s+)?(?:closed|has been filled|no longer available)/i,
  /applications?\s+(?:are\s+)?(?:closed|no longer being accepted)/i,
  /this\s+(?:job|vacancy|position)\s+(?:has\s+)?(?:expired|been filled)/i,
  /we are no longer accepting applications/i,
  /the closing date for this vacancy has passed/i,
  /this opportunity is no longer available/i
];

const LIVE_PATTERNS = [
  /\bapply\s+(?:now|here|online|for this (?:job|role|position))\b/i,
  /\bsubmit\s+(?:an?\s+)?application\b/i,
  /\bstart\s+(?:your\s+)?application\b/i,
  /\bapplication\s+(?:form|portal)\b/i,
  /\bapply\s+before\b/i,
  /\bapply\s+by\b/i
];

function normaliseText(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatch(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function titleEvidence(title, text) {
  const cleanTitle = normaliseText(title).toLowerCase();
  if (!cleanTitle || cleanTitle.length < 4) return false;
  const compactTitle = cleanTitle.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!compactTitle) return false;
  const words = compactTitle.split(' ').filter(word => word.length > 2);
  if (!words.length) return false;
  const matched = words.filter(word => text.includes(word)).length;
  return matched >= Math.min(3, words.length);
}

export function classifySourceResponse({ job = {}, statusCode, finalUrl = '', body = '', now = new Date() } = {}) {
  const text = normaliseText(body);
  const lower = text.toLowerCase();
  const checkedAt = new Date(now).toISOString();
  const closingAt = job?.dates?.closingAt ? new Date(job.dates.closingAt) : null;

  if (closingAt && !Number.isNaN(closingAt.getTime()) && closingAt.getTime() <= new Date(now).getTime()) {
    return {
      status: 'closed',
      evidenceType: 'closing_date',
      evidence: `Known closing date ${closingAt.toISOString()} has passed`,
      checkedAt
    };
  }

  if (statusCode === 404 || statusCode === 410) {
    return { status: 'closed', evidenceType: 'http_status', evidence: `Source returned HTTP ${statusCode}`, checkedAt };
  }

  if (statusCode == null) {
    return { status: 'unknown', evidenceType: 'request_error', evidence: 'Source request failed before an HTTP response was received', checkedAt };
  }

  if (statusCode === 403 || statusCode === 429) {
    return { status: 'unknown', evidenceType: 'http_status', evidence: `Source returned HTTP ${statusCode}; access was not independently verifiable`, checkedAt };
  }

  if (statusCode >= 500) {
    return { status: 'unknown', evidenceType: 'http_status', evidence: `Source returned HTTP ${statusCode}`, checkedAt };
  }

  const closedMatch = findMatch(CLOSED_PATTERNS, text);
  if (closedMatch) {
    return { status: 'closed', evidenceType: 'page_text', evidence: closedMatch, checkedAt };
  }

  if (statusCode >= 200 && statusCode < 400) {
    const hasTitle = titleEvidence(job.title, lower);
    const liveMatch = findMatch(LIVE_PATTERNS, text);
    const sourceStillLooksJobSpecific = /\/jobs?\/|\/jobadvert\/|\/postings?\/|\/o\/|\/job\//i.test(finalUrl || job?.source?.url || '');

    if (hasTitle && liveMatch && sourceStillLooksJobSpecific) {
      return { status: 'live', evidenceType: 'page_text', evidence: `${liveMatch}; job title evidence present`, checkedAt };
    }

    if (hasTitle && sourceStillLooksJobSpecific && /\b(?:job description|responsibilities|requirements|qualifications|salary|location)\b/i.test(text)) {
      return { status: 'live', evidenceType: 'job_page', evidence: 'Job-specific source page contains title and job-detail content', checkedAt };
    }
  }

  return {
    status: 'unknown',
    evidenceType: 'insufficient_evidence',
    evidence: `HTTP ${statusCode}; source page did not provide sufficiently strong live/closed evidence`,
    checkedAt
  };
}

async function fetchSource(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  if (!url) throw new Error('Missing source URL');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobMatchPortal/1.0 (+source-verification)',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
      }
    });
    const body = await response.text();
    return { statusCode: response.status, finalUrl: response.url || url, body };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyJobSource(job, options = {}) {
  const checkedAt = new Date().toISOString();
  const url = String(job?.source?.url || '').trim();
  if (!url) {
    return { status: 'unknown', evidenceType: 'missing_url', evidence: 'Job has no source URL', checkedAt, sourceUrl: '' };
  }

  try {
    const response = await fetchSource(url, options);
    return {
      ...classifySourceResponse({ job, ...response, now: checkedAt }),
      sourceUrl: url,
      httpStatus: response.statusCode,
      finalUrl: response.finalUrl
    };
  } catch (error) {
    return {
      status: 'unknown',
      evidenceType: 'request_error',
      evidence: error?.name === 'AbortError' ? `Source request timed out after ${options.timeoutMs || DEFAULT_TIMEOUT_MS}ms` : `Source request failed: ${error.message}`,
      checkedAt,
      sourceUrl: url
    };
  }
}

export { normaliseText };
