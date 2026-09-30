const RULES = [
  { ats: 'greenhouse', patterns: [/boards\.greenhouse\.io\/(?:embed\/)?([^/?#]+)/i, /greenhouse\.io\/(?:embed\/)?([^/?#]+)/i] },
  { ats: 'lever', patterns: [/jobs\.lever\.co\/([^/?#]+)/i, /lever\.co\/([^/?#]+)/i] },
  { ats: 'ashby', patterns: [/(?:jobs\.)?ashbyhq\.com\/([^/?#]+)/i] },
  { ats: 'workday', patterns: [/^https?:\/\/([^.]+)\.wd\d+\.myworkdayjobs\.com\/([^/?#]+)/i, /^https?:\/\/([^.]+)\.myworkdayjobs\.com\/([^/?#]+)/i] },
  { ats: 'smartrecruiters', patterns: [/careers\.smartrecruiters\.com\/([^/?#]+)/i, /api\.smartrecruiters\.com\/v1\/companies\/([^/?#]+)/i] },
  { ats: 'workable', patterns: [/^https?:\/\/([^.]+)\.workable\.com/i] },
  { ats: 'teamtailor', patterns: [/^https?:\/\/([^.]+)\.teamtailor\.com/i] },
  { ats: 'pinpoint', patterns: [/^https?:\/\/([^.]+)\.pinpointhq\.com/i] },
  { ats: 'recruitee', patterns: [/^https?:\/\/([^.]+)\.recruitee\.com/i] },
  { ats: 'bamboohr', patterns: [/^https?:\/\/([^.]+)\.bamboohr\.com/i] },
  { ats: 'nhs', patterns: [/jobs\.nhs\.uk/i] }
];

const SUPPORTED_ATS = new Set(RULES.map(rule => rule.ats));

function clean(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

export function isSupportedATS(value) {
  return SUPPORTED_ATS.has(String(value || '').trim().toLowerCase());
}

export function detectATS(careersUrl = '') {
  const url = clean(careersUrl);
  if (!url) return null;
  return RULES.find(rule => rule.patterns.some(pattern => pattern.test(url)))?.ats || null;
}

export function extractATSConfig(careersUrl = '') {
  const url = clean(careersUrl);
  if (!url) return { ats: null, slug: null };

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = url.match(pattern);
      if (!match) continue;

      if (rule.ats === 'workday') {
        return {
          ats: rule.ats,
          slug: match[1] || null,
          site: match[2] || null
        };
      }

      if (rule.ats === 'nhs') {
        return { ats: rule.ats, slug: null };
      }

      return { ats: rule.ats, slug: match[1] || null };
    }
  }

  return { ats: null, slug: null };
}

export function resolveATSConfig({ ats = '', atsSlug = '', careersUrl = '' } = {}) {
  const explicitATS = String(ats || '').trim().toLowerCase();
  const explicitSlug = String(atsSlug || '').trim();
  const detected = extractATSConfig(careersUrl);

  if (explicitATS && explicitATS !== 'auto') {
    if (!isSupportedATS(explicitATS)) {
      return { ats: null, slug: explicitSlug || null, source: 'invalid-explicit-ats', error: `Unsupported ATS: ${explicitATS}` };
    }
    return {
      ats: explicitATS,
      slug: explicitSlug || detected.slug || null,
      site: detected.site || null,
      source: 'explicit'
    };
  }

  if (detected.ats) {
    return {
      ats: detected.ats,
      slug: explicitSlug || detected.slug || null,
      site: detected.site || null,
      source: 'url'
    };
  }

  return { ats: null, slug: explicitSlug || null, site: null, source: 'unresolved' };
}
