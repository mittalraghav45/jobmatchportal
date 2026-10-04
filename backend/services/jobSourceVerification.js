const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

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

function isJobSpecificUrl(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (/\/(?:jobs?|jobadvert|postings?|o|job)\//i.test(path)) return true;
    if (host === 'jobs.ashbyhq.com' && path.split('/').filter(Boolean).length >= 2) return true;
    if (host === 'job-boards.greenhouse.io' && path.split('/').filter(Boolean).length >= 2) return true;
    if (host.endsWith('.myworkdayjobs.com') && /\/job\//i.test(path)) return true;
    if (host === 'apply.workable.com' && path.split('/').filter(Boolean).length >= 2) return true;
    if (host === 'jobs.jobvite.com' && path.split('/').filter(Boolean).length >= 2) return true;
    if (host.endsWith('.applytojob.com') && path.split('/').filter(Boolean).length >= 2) return true;
    if (host.endsWith('.careers.hibob.com') && path.split('/').filter(Boolean).length >= 2) return true;
    if (host === 'www.linkedin.com' && /\/jobs\/view\//i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function structuredJobEvidence(body = '') {
  const jsonLdMatches = String(body).match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of jsonLdMatches) {
    const json = block.replace(/^.*?>/, '').replace(/<\/script>\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(json);
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [])];
      for (const node of nodes) {
        if (node?.['@type'] === 'JobPosting' || (Array.isArray(node?.['@type']) && node['@type'].includes('JobPosting'))) return true;
      }
    } catch {}
  }
  return false;
}

export function classifySourceResponse({ job = {}, statusCode, finalUrl = '', body = '', now = new Date(), attempts = 1 } = {}) {
  const text = normaliseText(body);
  const lower = text.toLowerCase();
  const checkedAt = new Date(now).toISOString();
  const closingAt = job?.dates?.closingAt ? new Date(job.dates.closingAt) : null;
  const meta = { checkedAt, attempts };

  if (closingAt && !Number.isNaN(closingAt.getTime()) && closingAt.getTime() <= new Date(now).getTime()) {
    return { status: 'closed', evidenceType: 'closing_date', evidence: `Known closing date ${closingAt.toISOString()} has passed`, ...meta };
  }

  if (statusCode === 404 || statusCode === 410) return { status: 'closed', evidenceType: 'http_status', evidence: `Source returned HTTP ${statusCode}`, ...meta };
  if (statusCode == null) return { status: 'unknown', evidenceType: 'request_error', evidence: 'Source request failed before an HTTP response was received', ...meta };
  if (statusCode === 403 || statusCode === 429) return { status: 'unknown', evidenceType: 'http_status', evidence: `Source returned HTTP ${statusCode}; access was not independently verifiable`, ...meta };
  if (statusCode >= 500) return { status: 'unknown', evidenceType: 'http_status', evidence: `Source returned HTTP ${statusCode}`, ...meta };

  const closedMatch = findMatch(CLOSED_PATTERNS, text);
  if (closedMatch) return { status: 'closed', evidenceType: 'page_text', evidence: closedMatch, ...meta };

  if (statusCode >= 200 && statusCode < 400) {
    const hasTitle = titleEvidence(job.title, lower);
    const liveMatch = findMatch(LIVE_PATTERNS, lower);
    const originalUrl = job?.source?.url || '';
    const originalJobSpecificUrl = isJobSpecificUrl(originalUrl);
    const jobSpecificUrl = isJobSpecificUrl(finalUrl || originalUrl);
    const hasStructuredJob = structuredJobEvidence(body);
    const hasJobDetailContent = /\b(?:job description|responsibilities|requirements|qualifications|salary|location|about the role|what you will do|what you'll do)\b/i.test(text);

    if (originalJobSpecificUrl && finalUrl && !jobSpecificUrl && !hasStructuredJob) {
      return { status: 'unknown', evidenceType: 'redirected_source', evidence: 'Job-specific source URL redirected to a non-job page', ...meta };
    }

    if (hasTitle && (liveMatch || hasStructuredJob) && (jobSpecificUrl || hasStructuredJob)) {
      return {
        status: 'live',
        evidenceType: hasStructuredJob ? 'jobposting_schema' : 'page_text',
        evidence: hasStructuredJob ? 'JobPosting structured data and job title evidence present' : `${liveMatch}; job title evidence present`,
        ...meta
      };
    }

    if (hasTitle && jobSpecificUrl && hasJobDetailContent) {
      return { status: 'live', evidenceType: 'job_page', evidence: 'Job-specific source page contains title and job-detail content', ...meta };
    }

    if (hasStructuredJob && hasTitle) return { status: 'live', evidenceType: 'jobposting_schema', evidence: 'JobPosting structured data contains the discovered job title', ...meta };
  }

  return { status: 'unknown', evidenceType: 'insufficient_evidence', evidence: `HTTP ${statusCode}; source page did not provide sufficiently strong live/closed evidence`, ...meta };
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSource(url, { timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = DEFAULT_MAX_RETRIES, retryDelayMs = DEFAULT_RETRY_DELAY_MS, fetchImpl = globalThis.fetch } = {}) {
  if (!url) throw new Error('Missing source URL');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');

  let attempts = 0;
  let lastResponse = null;
  let lastError = null;

  while (attempts <= maxRetries) {
    attempts += 1;
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
      lastResponse = { statusCode: response.status, finalUrl: response.url || url, body, attempts };
      if (!RETRYABLE_STATUS.has(response.status) || attempts > maxRetries) return lastResponse;
    } catch (error) {
      lastError = error;
      if (attempts > maxRetries) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(retryDelayMs * attempts);
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error('Source request failed');
}

export async function verifyJobSource(job, options = {}) {
  const checkedAt = new Date().toISOString();
  const url = String(job?.source?.url || '').trim();
  if (!url) return { status: 'unknown', evidenceType: 'missing_url', evidence: 'Job has no source URL', checkedAt, sourceUrl: '', attempts: 0 };

  try {
    const response = await fetchSource(url, options);
    return { ...classifySourceResponse({ job, ...response, now: checkedAt }), sourceUrl: url, httpStatus: response.statusCode, finalUrl: response.finalUrl };
  } catch (error) {
    return {
      status: 'unknown', evidenceType: 'request_error',
      evidence: error?.name === 'AbortError' ? `Source request timed out after ${options.timeoutMs || DEFAULT_TIMEOUT_MS}ms` : `Source request failed: ${error.message}`,
      checkedAt, sourceUrl: url, attempts: (options.maxRetries ?? DEFAULT_MAX_RETRIES) + 1
    };
  }
}

export { normaliseText, titleEvidence, isJobSpecificUrl, structuredJobEvidence };
