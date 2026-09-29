const PLACEHOLDER_RE = /\[(?:X|[A-Z][A-Za-z0-9 _%-]*|Specific [A-Za-z ]+|Company Initiative)\]/g;

const clean = value => String(value ?? '').trim();
const words = value => clean(value).split(/\s+/).filter(Boolean).length;

export function validateApplicationOutput(output = {}, { maxCoverLetterWords = 400 } = {}) {
  const errors = [];
  const warnings = [];
  const coverLetter = clean(output.coverLetter);
  if (coverLetter && words(coverLetter) > maxCoverLetterWords) errors.push(`Cover letter exceeds ${maxCoverLetterWords} words.`);
  if (output.keywords && output.keywords.length > 15) errors.push('Keyword list exceeds 15 items.');
  const placeholders = [...new Set(JSON.stringify(output).match(PLACEHOLDER_RE) || [])];
  if (placeholders.length) warnings.push(`Verify placeholders before submission: ${placeholders.join(', ')}`);
  if (Array.isArray(output.unsupportedClaims) && output.unsupportedClaims.length) warnings.push('Potential unsupported claims require manual review.');
  return { valid: errors.length === 0, errors, warnings, placeholders };
}

export function selectApplicationOutput(result = {}, task = 'full') {
  const base = {
    keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 15) : [],
    skills: result.skills || {},
    experienceBullets: result.experienceBullets || [],
    projects: result.projects || [],
    summary: result.summary || result.professionalSummary || '',
    coverLetter: result.coverLetter || '',
    supportingStatement: result.supportingStatement || '',
    evidenceMatrix: result.evidenceMatrix || [],
    evidenceGaps: result.evidenceGaps || []
  };
  const selected = task === 'skills' ? { keywords: base.keywords, skills: base.skills } :
    task === 'experience' ? { experienceBullets: base.experienceBullets, evidenceGaps: base.evidenceGaps } :
    task === 'projects' ? { projects: base.projects, evidenceGaps: base.evidenceGaps } :
    task === 'summary' ? { summary: base.summary } :
    task === 'coverLetter' ? { summary: base.summary, coverLetter: base.coverLetter } :
    task === 'supportingStatement' ? { supportingStatement: base.supportingStatement, evidenceMatrix: base.evidenceMatrix, evidenceGaps: base.evidenceGaps } :
    task === 'coldEmail' ? { coldEmail: result.coldEmail || base.coverLetter } : base;
  return { ...selected, validation: validateApplicationOutput({ ...selected, ...result }) };
}
