const SKILL_ALIASES = {
  'react.js': 'react', reactjs: 'react', 'node.js': 'node.js', nodejs: 'node.js',
  typescript: 'typescript', javascript: 'javascript', 'restful': 'rest', 'rest api': 'rest',
  postgres: 'postgresql', mongodb: 'mongodb', 'ci/cd': 'ci/cd', 'github actions': 'github actions',
  'c#': 'c#', '.net': '.net'
};

const TECH_TERMS = [
  'react','typescript','javascript','node.js','nodejs','next.js','angular','vue','php','python','java','.net','c#',
  'aws','azure','gcp','docker','kubernetes','graphql','rest','postgresql','postgres','mongodb','mysql','redis',
  'elasticsearch','kafka','rabbitmq','jest','playwright','cypress','git','github actions','ci/cd','terraform','linux'
];

const SENIORITY = [
  ['intern', 0], ['graduate', 0], ['junior', 1], ['entry level', 1], ['associate', 2],
  ['mid-level', 2], ['mid level', 2], ['software engineer ii', 2], ['engineer ii', 2],
  ['senior', 3], ['lead', 4], ['principal', 5], ['staff', 5], ['head of', 5], ['director', 6]
];

function normalise(value) {
  const v = String(value || '').toLowerCase().trim();
  return SKILL_ALIASES[v] || v;
}

function has(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(text);
}

function unique(items) { return [...new Set(items.filter(Boolean).map(normalise))]; }

export function detectSeniority(title = '', description = '') {
  const source = `${title} ${description}`.toLowerCase();
  let best = {label:'unspecified', level:null};
  for (const [term, level] of SENIORITY) {
    if (source.includes(term) && (best.level === null || level > best.level)) best = {label:term, level};
  }
  return best;
}

export function extractTechnicalSkills(description = '') {
  const text = String(description || '').toLowerCase();
  return unique(TECH_TERMS.filter(term => has(text, term)));
}

function sectionBetween(text, starts, ends) {
  const lower = text.toLowerCase();
  let start = -1;
  for (const heading of starts) {
    const index = lower.indexOf(heading);
    if (index >= 0 && (start < 0 || index < start)) start = index + heading.length;
  }
  if (start < 0) return '';
  let end = text.length;
  for (const heading of ends) {
    const index = lower.indexOf(heading, start);
    if (index >= 0 && index < end) end = index;
  }
  return text.slice(start, end).trim();
}

export function extractCriteria(description = '') {
  const text = String(description || '');
  const essentialSection = sectionBetween(text,
    ['essential requirements', 'essential criteria', 'essential skills', 'must have', 'required skills'],
    ['desirable requirements', 'desirable criteria', 'desirable skills', 'nice to have', 'what we offer', 'about us']
  );
  const desirableSection = sectionBetween(text,
    ['desirable requirements', 'desirable criteria', 'desirable skills', 'nice to have'],
    ['what we offer', 'about us', 'benefits', 'how to apply']
  );
  const bulletise = section => section.split(/\n|•|(?<=\.)\s+(?=[A-Z])/).map(s => s.replace(/^[-*]\s*/, '').trim()).filter(s => s.length >= 4 && s.length <= 300).slice(0, 30);
  return { essential: bulletise(essentialSection), desirable: bulletise(desirableSection) };
}

export function detectSponsorshipLanguage(description = '') {
  const text = String(description || '').toLowerCase();
  const positive = /visa sponsorship|sponsorship available|skilled worker|certificate of sponsorship|cos\b|will sponsor|eligible for sponsorship/.test(text);
  const negative = /cannot sponsor|unable to sponsor|no sponsorship|does not sponsor|not able to sponsor|sponsorship is not available/.test(text);
  return {status: positive && !negative ? 'explicitly-mentioned' : negative ? 'explicitly-unavailable' : 'not-stated'};
}

export function extractSalary(description = '') {
  const text = String(description || '');
  const matches = [...text.matchAll(/£\s?([\d,]+)(?:\s*(?:-|to)\s*£?\s*([\d,]+))?\s*(?:per\s*(?:year|annum)|p\.a\.)?/gi)];
  if (!matches.length) return {min:null, max:null, currency:'GBP'};
  const first = matches[0];
  return {min:Number(first[1].replace(/,/g,'')), max:first[2] ? Number(first[2].replace(/,/g,'')) : Number(first[1].replace(/,/g,'')), currency:'GBP'};
}

export function analyseJob({title='', description='', location='', employmentType='', source='', ats='', postedAt=null, closingAt=null} = {}) {
  const criteria = extractCriteria(description);
  const technicalSkills = extractTechnicalSkills(description);
  const seniority = detectSeniority(title, description);
  const sponsorship = detectSponsorshipLanguage(description);
  const salary = extractSalary(description);
  return {
    title, location, employmentType, source, ats, postedAt, closingAt,
    seniority, technicalSkills, criteria, sponsorship, salary,
    analysedAt: new Date().toISOString()
  };
}

function roleFitScore(title = '') {
  const value = String(title).toLowerCase();
  if (/frontend|front-end|front end/.test(value)) return 15;
  if (/full[- ]stack/.test(value)) return 14;
  if (/software engineer|software developer/.test(value)) return 13;
  if (/web engineer|web developer/.test(value)) return 12;
  if (/backend|back-end/.test(value)) return 9;
  if (/devops|site reliability|sre|cloud|platform|infrastructure/.test(value)) return 8;
  if (/engineer|developer/.test(value)) return 6;
  return 2;
}

function experienceFitScore(seniorityLevel, yearsExperience) {
  const years = Number.isFinite(Number(yearsExperience)) ? Number(yearsExperience) : 0;
  if (seniorityLevel === null || seniorityLevel === undefined) return 15;
  if (seniorityLevel <= 1) return years <= 3 ? 15 : 12;
  if (seniorityLevel === 2) return years >= 1 ? 15 : 9;
  if (seniorityLevel === 3) return years >= 4 ? 15 : years >= 2 ? 10 : 5;
  if (seniorityLevel === 4) return years >= 6 ? 15 : years >= 4 ? 8 : 3;
  return years >= 8 ? 15 : years >= 5 ? 6 : 1;
}

function sponsorshipFitScore(status) {
  if (status === 'verified' || status === 'sponsor') return 10;
  if (status === 'not-sponsor') return 0;
  return 5;
}

export function scoreCandidateAgainstJob({cvSkills=[], yearsExperience=0, cvText='', job, sponsorshipStatus=null} = {}) {
  const skills = unique(cvSkills);
  const required = unique(job?.technicalSkills || []);
  const matchedSkills = required.filter(skill => skills.includes(skill) || has(String(cvText || ''), skill));
  const missingSkills = required.filter(skill => !matchedSkills.includes(skill));
  const skillScore = required.length ? (matchedSkills.length / required.length) * 45 : 45;
  const roleScore = roleFitScore(job?.title);
  const experienceScore = experienceFitScore(job?.seniority?.level, yearsExperience);
  const criteriaText = [...(job?.criteria?.essential || []), ...(job?.criteria?.desirable || [])].join(' ');
  const evidenceScore = criteriaText && cvText ? Math.min(15, Math.round((criteriaText.split(/\s+/).filter(w => w.length > 5 && has(cvText.toLowerCase(), w.toLowerCase())).length / Math.max(1, criteriaText.split(/\s+/).filter(w => w.length > 5).length)) * 15)) : 0;
  const sponsorshipScore = sponsorshipFitScore(sponsorshipStatus);
  const score = Math.min(100, Math.round(skillScore + roleScore + experienceScore + evidenceScore + sponsorshipScore));
  return {
    score,
    matchedSkills,
    missingSkills,
    components: {
      skillScore: Math.round(skillScore),
      roleScore,
      experienceScore,
      evidenceScore,
      sponsorshipScore
    }
  };
}
