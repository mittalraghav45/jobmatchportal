const ROLE_FAMILIES = Object.freeze({
  frontend: [/\bfrontend\b/i, /\bfront-end\b/i, /\bfront end\b/i, /\bweb (?:engineer|developer)\b/i],
  fullstack: [/\bfull[- ]?stack\b/i],
  software: [/\bsoftware (?:engineer|developer)\b/i, /\bapplication (?:engineer|developer)\b/i, /\bprogrammer\b/i],
  backend: [/\bbackend\b/i, /\bback-end\b/i, /\bback end\b/i],
  data: [/\bdata scientist\b/i, /\bdata science\b/i, /\bdata engineer\b/i, /\bdata engineering\b/i, /\bstatistical programmer\b/i, /\bstatistical analyst\b/i],
  machine_learning: [/\bmachine learning\b/i, /\bml engineer\b/i, /\bai engineer\b/i, /\bartificial intelligence\b/i],
  security: [/\bsecurity engineer\b/i, /\bcybersecurity\b/i, /\bcyber security\b/i, /\bsecurity analyst\b/i],
  devops: [/\bdevops\b/i, /\bsite reliability\b/i, /\bsre\b/i, /\binfrastructure engineer\b/i],
  cloud_platform: [/\bcloud engineer\b/i, /\bplatform engineer\b/i, /\bcloud architect\b/i],
  qa: [/\bqa engineer\b/i, /\bquality assurance\b/i, /\btest automation\b/i],
  mobile: [/\bandroid\b/i, /\bios\b/i, /\bmobile (?:engineer|developer)\b/i],
  management: [/\bengineering manager\b/i, /\btechnology manager\b/i, /\bengineering director\b/i, /\bhead of engineering\b/i]
});

const SPECIALISATIONS = Object.freeze({
  machine_learning: [/\bmachine learning\b/i, /\bml\b/i, /\bai\b/i, /\bartificial intelligence\b/i],
  mobile: [/\bandroid\b/i, /\bios\b/i, /\bmobile\b/i],
  data: [/\bdata scientist\b/i, /\bdata science\b/i, /\bdata engineer\b/i, /\bstatistical programmer\b/i, /\bstatistical analyst\b/i],
  security: [/\bsecurity\b/i, /\bcybersecurity\b/i, /\bcyber security\b/i],
  devops: [/\bdevops\b/i, /\bsite reliability\b/i, /\bsre\b/i],
  cloud_platform: [/\bcloud\b/i, /\bplatform\b/i, /\binfrastructure\b/i],
  qa: [/\bqa\b/i, /\bquality assurance\b/i, /\btest automation\b/i]
});

const ADJACENT = new Set([
  'frontend|fullstack', 'frontend|software', 'frontend|backend',
  'fullstack|software', 'fullstack|backend', 'software|backend',
  'software|cloud_platform', 'software|devops', 'backend|cloud_platform',
  'backend|devops', 'cloud_platform|devops'
]);

const normalisePair = (a, b) => [a, b].sort().join('|');

export function classifyRoleFamily(text = '') {
  const value = String(text);
  return Object.entries(ROLE_FAMILIES)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(value)))
    .map(([family]) => family);
}

export function classifyRoleSpecialisations(text = '') {
  const value = String(text);
  return Object.entries(SPECIALISATIONS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(value)))
    .map(([specialisation]) => specialisation);
}

function candidateFamilies(profile = {}) {
  const explicit = Array.isArray(profile.roleFamilies) ? profile.roleFamilies.filter(Boolean) : [];
  const text = [...(profile.targetTitles ?? [])].join(' ');
  const families = [...new Set([...explicit, ...classifyRoleFamily(text)])];
  return families.length ? families : ['software'];
}

function deriveCandidateSpecialisations(profile = {}) {
  const explicit = Array.isArray(profile.roleSpecialisations) ? profile.roleSpecialisations.filter(Boolean) : [];
  const titleText = [...(profile.targetTitles ?? [])].join(' ');
  return [...new Set([...explicit, ...classifyRoleSpecialisations(titleText)])];
}

function getJobFamilies(job = {}) {
  const titleFamilies = classifyRoleFamily(job.title ?? '');
  if (titleFamilies.length) return titleFamilies;
  return classifyRoleFamily(job.description ?? '');
}

export function roleFamilyCompatibility(job = {}, profile = {}) {
  const title = String(job.title ?? '');
  const jobFamilies = getJobFamilies(job);
  const candidate = candidateFamilies(profile);
  const jobSpecialisations = classifyRoleSpecialisations(title);
  const candidateSpecialisations = deriveCandidateSpecialisations(profile);

  if (!jobFamilies.length) {
    return { score: 0.5, status: 'unknown', jobFamilies: [], candidateFamilies: candidate, jobSpecialisations, candidateSpecialisations };
  }

  const specialistConflict = jobSpecialisations.some((specialisation) => !candidateSpecialisations.includes(specialisation));
  if (specialistConflict && jobSpecialisations.length) {
    return { score: 0.4, status: 'specialisation_mismatch', jobFamilies, candidateFamilies: candidate, jobSpecialisations, candidateSpecialisations };
  }

  if (jobFamilies.some((jobFamily) => candidate.includes(jobFamily))) {
    return { score: 1, status: 'match', jobFamilies, candidateFamilies: candidate, jobSpecialisations, candidateSpecialisations };
  }

  if (jobFamilies.some((jobFamily) => candidate.some((candidateFamily) => ADJACENT.has(normalisePair(jobFamily, candidateFamily))))) {
    return { score: 0.7, status: 'adjacent', jobFamilies, candidateFamilies: candidate, jobSpecialisations, candidateSpecialisations };
  }

  return { score: 0.15, status: 'mismatch', jobFamilies, candidateFamilies: candidate, jobSpecialisations, candidateSpecialisations };
}
