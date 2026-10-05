import { rankJob } from './jobRanking.js';
import { roleFamilyCompatibility } from '../utils/roleFamily.js';

const normalise = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
function textFor(job = {}) { return normalise([job.title, job.description, job.location, job.companyName, job.employerType].filter(Boolean).join(' ')); }
function hasAny(text, values = []) { return values.some((value) => value && text.includes(normalise(value))); }

function sponsorshipRequired(profile = {}) {
  return Boolean(
    profile?.workAuthorisation?.requiresSkilledWorkerSponsorship ||
    profile?.workAuthorisation?.sponsorshipRequired ||
    profile?.preferences?.requiresSponsorship ||
    profile?.preferences?.sponsorshipRequired
  );
}

function sponsorshipFit(job, profile) {
  if (!sponsorshipRequired(profile)) return { score: 0.5, status: 'not_required', reason: null };
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
  const excluded = [
    ...(profile?.excludedSkills ?? []),
    ...(profile?.preferences?.excludedSkills ?? []),
    ...(profile?.excludedKeywords ?? []),
    ...(profile?.preferences?.excludedKeywords ?? []),
    ...(profile?.preferences?.excludeTechnologies ?? [])
  ].filter(Boolean);
  return excluded.find((value) => containsExcludedTerm(text, value)) ?? null;
}

function experienceFit(job, profile) {
  const years = Number(profile?.yearsExperience ?? 0);
  const title = textFor(job);
  const management = /\b(engineering manager|technology manager|engineering director|director of engineering|head of engineering)\b/.test(title);
  const principal = /\b(staff|principal|director|head of)\b/.test(title);
  const lead = /\b(technical lead|engineering lead|tech lead)\b/.test(title);
  const senior = /\bsenior\b/.test(title);
  const earlyCareer = /\b(intern|internship|new grad|graduate|graduate programme|graduate program|apprentice|trainee)\b/.test(title);

  if (management || principal || lead) return { score: 0, status: 'far_above_target', reason: 'seniority_above_target' };
  if (earlyCareer) return { score: 0.15, status: 'below_target', reason: 'early_career_role_mismatch' };
  if (!years) return { score: senior ? 0.65 : 0.5, status: senior ? 'senior_caution' : 'unknown', reason: senior ? 'seniority_caution' : null };
  if (years < 4 && senior) return { score: 0.45, status: 'above_target', reason: 'seniority_caution' };
  return { score: 1, status: senior ? 'above_target' : 'match', reason: 'experience_match' };
}

export function matchJobToCandidate(job, profile = {}) {
  const base = rankJob(job, profile);
  const sponsorship = sponsorshipFit(job, profile);
  const experience = experienceFit(job, profile);
  const roleCompatibility = roleFamilyCompatibility(job, profile);
  const excluded = exclusions(job, profile);

  let matchScore = Math.round(
    base.matchScore * 0.65 +
    roleCompatibility.score * 10 +
    sponsorship.score * 10 +
    experience.score * 10
  );

  const strongCoreMatch = base.components.title >= 75 && base.components.skills >= 75 && roleCompatibility.score >= 0.7;
  const trustedFreshJob = base.components.verification >= 100 && base.components.freshness >= 80;
  const sponsorshipBlocked = sponsorship.status === 'explicitly_unavailable';
  const roleMismatch = ['mismatch', 'specialisation_mismatch'].includes(roleCompatibility.status);
  const hardSeniorityMismatch = experience.status === 'far_above_target';
  const earlyCareerMismatch = experience.reason === 'early_career_role_mismatch';

  const matchStrength = !roleMismatch && !hardSeniorityMismatch && !earlyCareerMismatch && strongCoreMatch && trustedFreshJob && !sponsorshipBlocked && experience.score >= 0.65
    ? 'strong'
    : (matchScore >= 65 && !sponsorshipBlocked && !roleMismatch && !hardSeniorityMismatch && !earlyCareerMismatch && roleCompatibility.score >= 0.7 ? 'possible' : 'weak');
  const strongApplicationCandidate = matchStrength === 'strong' && sponsorship.status === 'confirmed';

  if (strongApplicationCandidate) matchScore = Math.max(matchScore, 85);
  if (roleMismatch) matchScore = Math.min(matchScore, 45);
  if (hardSeniorityMismatch) matchScore = Math.min(matchScore, 30);
  if (earlyCareerMismatch) matchScore = Math.min(matchScore, 45);
  if (excluded) matchScore = Math.min(matchScore, 20);

  const reasons = [...base.reasons];
  if (sponsorship.reason) reasons.push(sponsorship.reason);
  if (experience.reason) reasons.push(experience.reason);
  if (roleCompatibility.status === 'match') reasons.push('role_family_match');
  if (roleCompatibility.status === 'adjacent') reasons.push('role_family_adjacent');
  if (roleCompatibility.status === 'specialisation_mismatch') reasons.push('role_specialisation_mismatch');
  if (roleCompatibility.status === 'mismatch') reasons.push('role_family_mismatch');
  if (strongCoreMatch) reasons.push('strong_core_match');
  if (matchStrength === 'strong') reasons.push('strong_match');
  if (strongApplicationCandidate) reasons.push('strong_application_candidate');
  if (hardSeniorityMismatch) reasons.push('seniority_above_target');
  if (excluded) reasons.push(`excluded_keyword:${normalise(excluded)}`);

  let applicationFit = matchStrength;
  if (strongApplicationCandidate) applicationFit = 'strong';
  else if (matchStrength === 'strong' && sponsorship.status === 'unconfirmed') applicationFit = 'strong_unconfirmed_sponsorship';
  if (excluded || sponsorshipBlocked || hardSeniorityMismatch) applicationFit = 'weak';

  return {
    matchScore: Math.max(0, Math.min(100, matchScore)),
    matchStrength,
    applicationFit,
    reasons: [...new Set(reasons)],
    components: {
      ...base.components,
      roleCompatibility: Math.round(roleCompatibility.score * 100),
      roleCompatibilityStatus: roleCompatibility.status,
      roleFamilies: roleCompatibility.jobFamilies,
      candidateRoleFamilies: roleCompatibility.candidateFamilies,
      roleSpecialisations: roleCompatibility.jobSpecialisations,
      candidateRoleSpecialisations: roleCompatibility.candidateSpecialisations,
      sponsorship: Math.round(sponsorship.score * 100),
      sponsorshipStatus: sponsorship.status,
      experience: Math.round(experience.score * 100),
      experienceStatus: experience.status
    }
  };
}
