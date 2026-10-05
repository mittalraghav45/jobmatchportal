const ROLE_FAMILIES = Object.freeze({
  frontend: [/\bfrontend\b/i, /\bfront-end\b/i, /\bfront end\b/i, /\breact\b/i, /\bjavascript\b/i, /\btypescript\b/i, /\bweb (?:engineer|developer)\b/i],
  fullstack: [/\bfull[- ]?stack\b/i],
  software: [/\bsoftware (?:engineer|developer)\b/i, /\bapplication (?:engineer|developer)\b/i, /\bprogrammer\b/i],
  backend: [/\bbackend\b/i, /\bback-end\b/i, /\bback end\b/i, /\bnode(?:\.js)?\b/i, /\bphp\b/i],
  data: [/\bdata scientist\b/i, /\bdata science\b/i, /\bdata engineer\b/i, /\bdata engineering\b/i],
  machine_learning: [/\bmachine learning\b/i, /\bml engineer\b/i, /\bai engineer\b/i, /\bartificial intelligence\b/i],
  security: [/\bsecurity engineer\b/i, /\bcybersecurity\b/i, /\bcyber security\b/i, /\bsecurity analyst\b/i],
  devops: [/\bdevops\b/i, /\bsite reliability\b/i, /\bsre\b/i, /\binfrastructure engineer\b/i],
  cloud_platform: [/\bcloud engineer\b/i, /\bplatform engineer\b/i, /\bcloud architect\b/i],
  qa: [/\bqa engineer\b/i, /\bquality assurance\b/i, /\btest automation\b/i]
});

const ADJACENT = new Set([
  'frontend|fullstack', 'frontend|software', 'frontend|backend',
  'fullstack|software', 'fullstack|backend', 'software|backend',
  'software|cloud_platform', 'software|devops', 'backend|cloud_platform',
  'backend|devops', 'cloud_platform|devops', 'software|machine_learning',
  'software|machine_learning'
]);

const normalisePair = (a, b) => [a, b].sort().join('|');

export function classifyRoleFamily(text = '') {
  const value = String(text);
  const matches = Object.entries(ROLE_FAMILIES)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(value)))
    .map(([family]) => family);
  return matches;
}

function candidateFamilies(profile = {}) {
  const text = [
    ...(profile.targetTitles ?? []),
    ...(profile.skills ?? []),
    ...(profile.roleFamilies ?? [])
  ].join(' ');
  const families = classifyRoleFamily(text);
  return families.length ? families : ['software'];
}

export function roleFamilyCompatibility(job = {}, profile = {}) {
  const jobText = [job.title, job.description].filter(Boolean).join(' ');
  const jobFamilies = classifyRoleFamily(jobText);
  const candidate = candidateFamilies(profile);

  if (!jobFamilies.length) {
    return { score: 0.5, status: 'unknown', jobFamilies: [], candidateFamilies: candidate };
  }

  if (jobFamilies.some((jobFamily) => candidate.includes(jobFamily))) {
    return { score: 1, status: 'match', jobFamilies, candidateFamilies: candidate };
  }

  if (jobFamilies.some((jobFamily) => candidate.some((candidateFamily) => ADJACENT.has(normalisePair(jobFamily, candidateFamily))))) {
    return { score: 0.7, status: 'adjacent', jobFamilies, candidateFamilies: candidate };
  }

  return { score: 0.15, status: 'mismatch', jobFamilies, candidateFamilies: candidate };
}
