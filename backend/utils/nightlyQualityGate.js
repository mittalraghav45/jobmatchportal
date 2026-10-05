const STRONG_FITS = new Set(['strong', 'strong_unconfirmed_sponsorship']);
const SPECIALIST_MISMATCHES = new Set(['specialisation_mismatch', 'specialist_mismatch']);

function isStrong(candidate) {
  return STRONG_FITS.has(candidate?.applicationFit);
}

export function evaluateNightlyQualityGate(candidates = []) {
  const critical = [];
  const warnings = [];
  let strongCount = 0;
  let strongUnknownSponsorship = 0;
  let strongWithLowSkills = 0;
  let strongWithRoleProblems = 0;
  let strongWithExperienceProblems = 0;
  let strongWithExcludedTechnology = 0;
  let strongSpecialistMismatches = 0;
  let strongSeniorityCautions = 0;

  for (const candidate of candidates) {
    if (!isStrong(candidate)) continue;

    strongCount += 1;
    if (candidate.applicationFit === 'strong_unconfirmed_sponsorship') strongUnknownSponsorship += 1;

    const components = candidate.components || {};
    const roleStatus = components.roleCompatibilityStatus || 'unknown';
    const experienceStatus = components.experienceStatus || 'unknown';
    const skills = Number(components.skills || 0);
    const reasons = Array.isArray(candidate.reasons) ? candidate.reasons : [];

    if (skills < 60) {
      strongWithLowSkills += 1;
      critical.push({ jobId: candidate.jobId, title: candidate.title, issue: 'strong_below_skill_threshold', skills });
    }

    if (SPECIALIST_MISMATCHES.has(roleStatus) || roleStatus === 'mismatch' || roleStatus === 'unknown') {
      strongWithRoleProblems += 1;
      if (SPECIALIST_MISMATCHES.has(roleStatus)) strongSpecialistMismatches += 1;
      critical.push({ jobId: candidate.jobId, title: candidate.title, issue: 'strong_role_compatibility_problem', roleStatus });
    }

    if (!['match', 'adjacent'].includes(experienceStatus)) {
      strongWithExperienceProblems += 1;
      critical.push({ jobId: candidate.jobId, title: candidate.title, issue: 'strong_experience_problem', experienceStatus });
    }

    if (reasons.some(reason => reason.startsWith('excluded_'))) {
      strongWithExcludedTechnology += 1;
      critical.push({ jobId: candidate.jobId, title: candidate.title, issue: 'strong_contains_excluded_technology' });
    }

    if (reasons.includes('seniority_caution')) strongSeniorityCautions += 1;
  }

  if (strongSeniorityCautions > 0) {
    warnings.push({ issue: 'strong_seniority_caution', count: strongSeniorityCautions });
  }

  if (strongUnknownSponsorship > 0) {
    warnings.push({ issue: 'strong_sponsorship_unconfirmed', count: strongUnknownSponsorship });
  }

  return {
    status: critical.length === 0 ? 'PASS' : 'FAIL',
    strongCount,
    strongUnknownSponsorship,
    strongWithLowSkills,
    strongWithRoleProblems,
    strongWithExperienceProblems,
    strongWithExcludedTechnology,
    strongSpecialistMismatches,
    strongSeniorityCautions,
    criticalCount: critical.length,
    warningCount: warnings.length,
    critical,
    warnings
  };
}
