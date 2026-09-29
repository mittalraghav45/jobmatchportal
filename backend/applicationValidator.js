const REQUIRED_KEYS = [
  'classification','keywords','skills','experienceBullets','projects','summary',
  'coverLetter','supportingStatement','evidenceMatrix','evidenceGaps'
];

function textOf(value) {
  if (Array.isArray(value)) return value.join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value || '');
}

export function validateApplicationOutput(output = {}, options = {}) {
  const publicSector = options.publicSector === true;
  const candidateEvidence = String(options.candidateEvidence || '').toLowerCase();
  const errors = [];
  const warnings = [];

  for (const key of REQUIRED_KEYS) {
    if (!(key in output)) errors.push(`Missing output field: ${key}`);
  }

  if (!Array.isArray(output.keywords)) warnings.push('keywords should be an array');
  if (!Array.isArray(output.skills)) warnings.push('skills should be an array');
  if (!Array.isArray(output.experienceBullets)) warnings.push('experienceBullets should be an array');
  if (!Array.isArray(output.projects)) warnings.push('projects should be an array');
  if (!Array.isArray(output.evidenceMatrix)) warnings.push('evidenceMatrix should be an array');

  const coverLetter = textOf(output.coverLetter);
  const coverWords = coverLetter.trim() ? coverLetter.trim().split(/\s+/).length : 0;
  if (coverWords > 400) errors.push(`Cover letter exceeds 400 words (${coverWords})`);
  if (publicSector && !String(output.supportingStatement || '').trim()) {
    warnings.push('Public-sector application has no supporting statement');
  }
  if (!publicSector && String(output.supportingStatement || '').trim()) {
    warnings.push('Supporting statement supplied for a commercial application');
  }

  const generatedText = Object.values(output).map(textOf).join('\n');
  const placeholders = [...new Set(generatedText.match(/\[[^\]]{1,80}\]/g) || [])];
  const unverifiedMetricClaims = generatedText.match(/\b(?:increased|reduced|saved|grew|improved|delivered)\b[^.\n]{0,100}\b\d+(?:\.\d+)?%?\b/gi) || [];
  if (unverifiedMetricClaims.length && !candidateEvidence) {
    warnings.push('Generated metric-like claims require manual verification against candidate evidence');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    placeholders,
    coverLetterWords: coverWords
  };
}

export function stripUnsupportedFields(output = {}) {
  return Object.fromEntries(REQUIRED_KEYS.filter(key => key in output).map(key => [key, output[key]]));
}
