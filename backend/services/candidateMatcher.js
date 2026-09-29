const STOP_WORDS = new Set(['and','the','with','for','from','into','using','years','year','experience','skills','skill','knowledge','ability','strong','good','working','work','role','roles','team','teams','develop','development','developer','software','engineering']);

function normalise(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9+#.\- ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsTerm(haystack, term) {
  const value = normalise(haystack);
  const needle = normalise(term);
  if (!needle) return false;
  return new RegExp(`(?:^|\\s)${needle.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:$|\\s)`, 'i').test(value);
}

export function extractMeaningfulTerms(text = '') {
  return [...new Set(normalise(text).split(/\s+/).filter(word => word.length >= 4 && !STOP_WORDS.has(word)))];
}

export function scoreJobAgainstCandidate(job = {}, candidate = {}) {
  const title = job.title || '';
  const description = job.description || '';
  const corpus = `${title} ${description}`;
  const preferred = Array.isArray(candidate.preferredTechnologies) ? candidate.preferredTechnologies : [];
  const excluded = Array.isArray(candidate.excludedTechnologies) ? candidate.excludedTechnologies : [];
  const targetRoles = Array.isArray(candidate.targetRoles) ? candidate.targetRoles : [];

  const preferredHits = preferred.filter(skill => containsTerm(corpus, skill));
  const excludedHits = excluded.filter(skill => containsTerm(corpus, skill));
  const roleHits = targetRoles.filter(role => containsTerm(title, role) || containsTerm(corpus, role));
  const location = normalise(job.location || '');
  const locations = (candidate.locations || []).map(normalise);
  const locationHit = !locations.length || locations.some(item => location.includes(item) || item.includes(location));
  const employment = normalise(job.employmentType || job.employment_type || '');
  const employmentHit = !candidate.preferredEmploymentTypes?.length || candidate.preferredEmploymentTypes.some(type => employment.includes(normalise(type)));

  const skillScore = preferred.length ? Math.min(45, Math.round((preferredHits.length / preferred.length) * 45)) : 0;
  const roleScore = targetRoles.length ? Math.min(25, Math.round((roleHits.length / targetRoles.length) * 25)) : 0;
  const locationScore = locationHit ? 10 : 0;
  const employmentScore = employmentHit ? 5 : 0;
  const exclusionPenalty = Math.min(30, excludedHits.length * 15);
  const score = Math.max(0, Math.min(100, skillScore + roleScore + locationScore + employmentScore + 15 - exclusionPenalty));

  return {
    score,
    preferredHits,
    excludedHits,
    roleHits,
    locationHit,
    employmentHit,
    breakdown: { skills: skillScore, role: roleScore, location: locationScore, employment: employmentScore, base: 15, exclusionPenalty },
    recommendation: score >= Number(candidate.minimumMatchPercent || 60) && excludedHits.length === 0 ? 'review' : 'low-match'
  };
}
