import { rankJob } from './jobRanking.js';

const normalise = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
function textFor(job = {}) { return normalise([job.title, job.description, job.location, job.companyName, job.employerType].filter(Boolean).join(' ')); }
function hasAny(text, values = []) { return values.some((value) => value && text.includes(normalise(value))); }

function sponsorshipFit(job, profile) {
  if (!profile?.workAuthorisation?.sponsorshipRequired && !profile?.preferences?.sponsorshipRequired) return { score: 0.5, status: 'not_required', reason: null };
  const text = textFor(job);
  const positive = ['visa sponsorship', 'skilled worker sponsorship', 'sponsor licence', 'certificate of sponsorship', 'sponsorship available', 'will sponsor'];
  const negative = ['unable to sponsor', 'cannot sponsor', 'no sponsorship', 'not able to sponsor', 'does not sponsor', 'without sponsorship'];
  if (hasAny(text, negative)) return { score: 0, status: 'explicitly_unavailable', reason: 'sponsorship_not_supported' };
  if (hasAny(text, positive)) return { score: 1, status: 'confirmed', reason: 'sponsorship_evidence' };
  return { score: 0.25, status: 'unconfirmed', reason: 'sponsorship_not_confirmed' };
}

function containsExcludedTerm(text, value) {
  const term = normalise(value);
  if (!term) return false;
  if (term.includes(' ')) return (` ${text} `).includes(` ${term} `);
  return text.split(/\s+/).includes(term);
}

function exclusions(job, profile) {
  const text = textFor(job);
  const excluded = [...(profile?.excludedSkills ?? []), ...(profile?.preferences?.excludedSkills ?? []), ...(profile?.excludedKeywords ?? []), ...(profile?.preferences?.excludedKeywords ?? [])].filter(Boolean);
  return excluded.find((value) => containsExcludedTerm(text, value)) ?? null;
}

function experienceFit(job, profile) {
  const years = Number(profile?.yearsExperience ?? 0);
  if (!years) return { score: 0.5, reason: null };
  const senior = /\b(senior|staff|principal|lead|head of|director)\b/.test(textFor(job));
  if (years < 2 && senior) return { score: 0.2, reason: 'experience_gap_for_seniority' };
  if (years < 4 && senior) return { score: 0.65, reason: 'seniority_caution' };
  return { score: 1, reason: 'experience_match' };
}

export function matchJobToCandidate(job, profile = {}) {
  const base = rankJob(job, profile);
  const sponsorship = sponsorshipFit(job, profile);
  const experience = experienceFit(job, profile);
  const excluded = exclusions(job, profile);

  let matchScore = Math.round(base.matchScore * 0.75 + sponsorship.score * 10 + experience.score * 10);

  const strongCoreMatch = base.components.title >= 75 && base.components.skills >= 75;
  const trustedFreshJob = base.components.verification >= 100 && base.components.freshness >= 80;
  const sponsorshipBlocked = sponsorship.status === 'explicitly_unavailable';
  const strongApplicationCandidate = strongCoreMatch && trustedFreshJob && sponsorship.status === 'confirmed' && !sponsorshipBlocked && experience.score >= 0.65;

  if (strongApplicationCandidate) matchScore = Math.max(matchScore, 85);
  if (excluded) matchScore = Math.min(matchScore, 20);

  const reasons = [...base.reasons];
  if (sponsorship.reason) reasons.push(sponsorship.reason);
  if (experience.reason) reasons.push(experience.reason);
  if (strongCoreMatch) reasons.push('strong_core_match');
  if (strongApplicationCandidate) reasons.push('strong_application_candidate');
  if (excluded) reasons.push(`excluded_keyword:${normalise(excluded)}`);

  let applicationFit = 'weak';
  if (strongApplicationCandidate && !excluded) applicationFit = 'strong';
  else if (matchScore >= 65 && !excluded && !sponsorshipBlocked) applicationFit = 'possible';

  return {
    matchScore: Math.max(0, Math.min(100, matchScore)),
    applicationFit,
    reasons: [...new Set(reasons)],
    components: {
      ...base.components,
      sponsorship: Math.round(sponsorship.score * 100),
      sponsorshipStatus: sponsorship.status,
      experience: Math.round(experience.score * 100)
    }
  };
}
