const DEFAULT_WEIGHTS = Object.freeze({
  title: 25,
  skills: 30,
  seniority: 10,
  location: 10,
  employmentType: 5,
  freshness: 10,
  verification: 10
});

const normalise = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
const tokens = (value = '') => new Set(normalise(value).split(/\s+/).filter(Boolean));

function overlapScore(required, candidate) {
  const a = Array.isArray(required) ? required.map(normalise).filter(Boolean) : [...tokens(required)];
  const b = new Set(Array.isArray(candidate) ? candidate.map(normalise) : [...tokens(candidate)]);
  if (!a.length) return 0;
  return a.filter((item) => b.has(item) || [...b].some((value) => value.includes(item) || item.includes(value))).length / a.length;
}

function titleScore(jobTitle, targetTitles = []) {
  if (!targetTitles.length) return 0.5;
  const job = normalise(jobTitle);
  return Math.max(...targetTitles.map((title) => {
    const target = normalise(title);
    if (!target) return 0;
    if (job === target) return 1;
    const jobWords = tokens(job);
    const targetWords = tokens(target);
    const common = [...targetWords].filter((word) => jobWords.has(word)).length;
    return targetWords.size ? common / targetWords.size : 0;
  }));
}

function freshnessScore(freshness) {
  return { fresh: 1, recent: 0.8, ageing: 0.5, stale: 0.2, expired: 0, unknown: 0.25 }[freshness] ?? 0.25;
}

function verificationScore(status) {
  return { live: 1, closed: 0, unknown: 0.2 }[status] ?? 0.2;
}

function seniorityScore(jobTitle, targetSeniority = []) {
  if (!targetSeniority.length) return 0.5;
  const title = normalise(jobTitle);
  const hit = targetSeniority.find((level) => title.includes(normalise(level)));
  return hit ? 1 : 0;
}

export function rankJob(job, profile = {}, weights = DEFAULT_WEIGHTS) {
  const skillScore = overlapScore(profile.skills ?? [], `${job.title ?? ''} ${job.description ?? ''}`);
  const title = titleScore(job.title, profile.targetTitles ?? []);
  const seniority = seniorityScore(job.title, profile.targetSeniority ?? []);
  const location = profile.locations?.length ? overlapScore(profile.locations, job.location ?? '') : 0.5;
  const employmentType = profile.employmentTypes?.length ? overlapScore(profile.employmentTypes, job.employmentType ?? '') : 0.5;
  const freshness = freshnessScore(job.quality?.freshness ?? job.freshness);
  const verification = verificationScore(job.verification?.status ?? job.verificationStatus);

  const components = { title, skills: skillScore, seniority, location, employmentType, freshness, verification };
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const matchScore = Math.round(Object.entries(components).reduce((sum, [key, value]) => sum + value * (weights[key] ?? 0), 0) / totalWeight * 100);

  const reasons = [];
  if (title >= 0.75) reasons.push('strong_title_match');
  if (skillScore >= 0.6) reasons.push('strong_skill_match');
  if (seniority === 1) reasons.push('seniority_match');
  if (location >= 0.75) reasons.push('location_match');
  if (employmentType >= 0.75) reasons.push('employment_type_match');
  if (verification === 1) reasons.push('verified_live');
  if (freshness >= 0.8) reasons.push('fresh_source');

  return {
    matchScore,
    reasons,
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Math.round(value * 100)]))
  };
}

export { DEFAULT_WEIGHTS };
