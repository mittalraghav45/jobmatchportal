const PLACEHOLDER_RE = /\[(?:X|[A-Z][A-Za-z0-9 _%-]*|Specific [A-Za-z ]+|Company Initiative)\]/g;

function clean(value) {
  return String(value || '').trim();
}

function wordCount(value) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

export function buildEvidenceProfile({ cvText = '', cvSkills = [], experience = [], projects = [] } = {}) {
  return {
    cvText: clean(cvText),
    skills: [...new Set((cvSkills || []).map(s => clean(s).toLowerCase()).filter(Boolean))],
    experience: (experience || []).map(item => ({
      employer: clean(item.employer),
      role: clean(item.role),
      period: clean(item.period),
      bullets: (item.bullets || []).map(clean).filter(Boolean)
    })),
    projects: (projects || []).map(item => ({
      name: clean(item.name),
      technologies: (item.technologies || []).map(clean).filter(Boolean),
      bullets: (item.bullets || []).map(clean).filter(Boolean)
    }))
  };
}

export function validateApplicationPack(pack = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const maxCoverLetterWords = options.maxCoverLetterWords ?? 400;
  const coverLetter = clean(pack.coverLetter);

  if (pack.coverLetter !== undefined && wordCount(coverLetter) > maxCoverLetterWords) {
    errors.push(`Cover letter exceeds ${maxCoverLetterWords} words.`);
  }
  if (!clean(pack.summary) && !clean(pack.professionalSummary)) errors.push('Professional summary is missing.');
  if (Array.isArray(pack.keywords) && pack.keywords.length > 15) errors.push('Keyword list exceeds the 15-keyword contract.');

  const serialised = JSON.stringify(pack);
  const placeholders = [...new Set(serialised.match(PLACEHOLDER_RE) || [])];
  if (placeholders.length) warnings.push(`Verify placeholders before submission: ${placeholders.join(', ')}`);

  const unsupportedClaims = Array.isArray(pack.unsupportedClaims) ? pack.unsupportedClaims.filter(Boolean) : [];
  if (unsupportedClaims.length) warnings.push('Potential unsupported claims require manual review.');

  return { valid: errors.length === 0, errors, warnings, placeholders };
}

export function buildApplicationPromptContext({ job = {}, candidateEvidence = {}, task = 'full', specialist = 'all-in-one' } = {}) {
  return {
    specialist,
    task,
    job: {
      title: clean(job.title),
      company: clean(job.companyName || job.company),
      description: clean(job.description),
      essential: job.criteria?.essential || [],
      desirable: job.criteria?.desirable || [],
      technicalSkills: job.technicalSkills || [],
      sponsorship: job.sponsorship || {}
    },
    candidate: buildEvidenceProfile(candidateEvidence),
    instruction: 'Use only candidate evidence supplied here. Do not invent achievements, metrics, tools, employers, responsibilities or sector experience. Use clearly marked placeholders for missing measurable evidence and flag them for verification.'
  };
}

export function buildApplicationPack(result = {}) {
  const pack = {
    keywords: result.keywords || [],
    skills: result.skills || {},
    experienceBullets: result.experienceBullets || [],
    projects: result.projects || [],
    summary: result.summary || result.professionalSummary || '',
    coverLetter: result.coverLetter || '',
    supportingStatement: result.supportingStatement || '',
    evidenceMatrix: result.evidenceMatrix || [],
    evidenceGaps: result.evidenceGaps || []
  };
  return { ...pack, validation: validateApplicationPack(pack) };
}
