const { URL } = require('url');

/**
 * Normalise a job source URL into a small set of diagnostics-friendly
 * categories. This module intentionally does not decide whether a job is
 * live or closed; it explains why source verification may be inconclusive.
 */
function classifySourceUrl(sourceUrl) {
  if (!sourceUrl) return 'missing';

  let url;
  try {
    url = new URL(sourceUrl);
  } catch (_) {
    return 'invalid';
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (/greenhouse\.io$/.test(host)) return 'greenhouse';
  if (/lever\.co$/.test(host)) return 'lever';
  if (/ashbyhq\.com$/.test(host)) return 'ashby';
  if (/myworkdayjobs\.com$/.test(host)) return 'workday';
  if (/smartrecruiters\.com$/.test(host)) return 'smartrecruiters';
  if (/recruitee\.com$/.test(host)) return 'recruitee';

  if (/\/jobs?\//.test(path)) return 'generic-job-path';
  if (/\/careers?\//.test(path)) return 'career-page';
  if (/\/jobadvert\//.test(path)) return 'jobadvert';
  if (/\/postings?\//.test(path)) return 'posting';

  return 'company-source';
}

function classifyVerificationOutcome(result = {}) {
  const status = Number(result.httpStatus || result.statusCode || 0);
  const error = String(result.error || '').toLowerCase();
  const reason = String(result.reason || '').toLowerCase();

  if (result.status === 'live') return 'live-evidence';
  if (result.status === 'closed') return 'closed-evidence';

  if (status === 403) return 'blocked-403';
  if (status === 429) return 'rate-limited-429';
  if (status >= 500 && status <= 599) return 'source-5xx';
  if (status === 404 || status === 410) return 'not-found';
  if (/timeout|timed out|abort/.test(error)) return 'timeout';
  if (/unsupported|not supported/.test(reason)) return 'ats-unsupported';
  if (/generic|career page|careers page/.test(reason)) return 'generic-careers-page';
  if (/insufficient|evidence/.test(reason)) return 'insufficient-evidence';
  if (/redirect/.test(reason)) return 'redirected';

  if (status === 200) return 'http-200-unclassified';
  if (!status) return 'no-http-status';

  return `http-${status}`;
}

module.exports = {
  classifySourceUrl,
  classifyVerificationOutcome,
};
