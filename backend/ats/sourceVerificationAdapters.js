const { URL } = require('url');

function hostMatches(hostname, suffix) {
  const host = String(hostname || '').toLowerCase();
  return host === suffix || host.endsWith(`.${suffix}`);
}

function detectSourceAdapter(sourceUrl, ats) {
  if (!sourceUrl) return null;
  let url;
  try { url = new URL(sourceUrl); } catch (_) { return null; }

  const host = url.hostname.toLowerCase();
  const declared = String(ats || '').toLowerCase();

  if (declared.includes('greenhouse') || hostMatches(host, 'greenhouse.io')) return 'greenhouse';
  if (declared.includes('lever') || hostMatches(host, 'lever.co')) return 'lever';
  if (declared.includes('ashby') || hostMatches(host, 'ashbyhq.com')) return 'ashby';
  if (declared.includes('workday') || hostMatches(host, 'myworkdayjobs.com')) return 'workday';
  if (declared.includes('smartrecruiters') || hostMatches(host, 'smartrecruiters.com')) return 'smartrecruiters';
  if (declared.includes('recruitee') || hostMatches(host, 'recruitee.com')) return 'recruitee';

  return null;
}

function buildAdapter(adapterName, sourceUrl) {
  if (!adapterName || !sourceUrl) return null;
  let url;
  try { url = new URL(sourceUrl); } catch (_) { return null; }

  switch (adapterName) {
    case 'greenhouse':
      return {
        name: 'greenhouse',
        sourceUrl,
        apiCandidate: /^https?:$/.test(url.protocol) && /greenhouse\.io$/i.test(url.hostname)
          ? `${url.protocol}//${url.hostname}/job-board-api${url.pathname}`
          : null,
        strongJobUrl: /\/jobs\//i.test(url.pathname) || /\/job\//i.test(url.pathname),
      };
    case 'lever':
      return {
        name: 'lever',
        sourceUrl,
        apiCandidate: /lever\.co$/i.test(url.hostname) ? `${url.protocol}//${url.hostname}${url.pathname}.json` : null,
        strongJobUrl: /\/jobs\//i.test(url.pathname),
      };
    case 'ashby':
      return {
        name: 'ashby',
        sourceUrl,
        apiCandidate: /ashbyhq\.com$/i.test(url.hostname) ? `${url.protocol}//${url.hostname}${url.pathname}` : null,
        strongJobUrl: /\/jobs\//i.test(url.pathname),
      };
    case 'workday':
      return {
        name: 'workday',
        sourceUrl,
        apiCandidate: null,
        strongJobUrl: /\/job\//i.test(url.pathname) || /\/en-us\/job\//i.test(url.pathname),
      };
    case 'smartrecruiters':
      return {
        name: 'smartrecruiters',
        sourceUrl,
        apiCandidate: null,
        strongJobUrl: /\/job\//i.test(url.pathname),
      };
    case 'recruitee':
      return {
        name: 'recruitee',
        sourceUrl,
        apiCandidate: null,
        strongJobUrl: /\/o\/[^/]+\/jobs\//i.test(url.pathname),
      };
    default:
      return null;
  }
}

module.exports = { detectSourceAdapter, buildAdapter };
