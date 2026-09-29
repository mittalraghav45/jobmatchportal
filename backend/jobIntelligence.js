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

export function scoreCandidateAgainstJob({cvSkills=[], yearsExperience=0, cvText='', job} = {}) {
  const skills = unique(cvSkills);
  const required = unique(job?.technicalSkills || []);
  const matchedSkills = required.filter(skill => skills.includes(skill) || has(String(cvText || ''), skill));
  const missingSkills = required.filter(skill => !matchedSkills.includes(skill));
  const skillScore = required.length ? (matchedSkills.length / required.length) * 45 : 45;
  const title = String(job?.title || '').toLowerCase();
  const roleScore = /engineer|developer|software|frontend|front-end|backend|back-end|full-stack|full stack|web/.test(title) ? 20 : 5;
  const seniority = job?.seniority?.level;
  const experienceScore = seniority === null || seniority === undefined ? 15 : seniority <= 2 && yearsExperience >= 1 ? 15 : seniority <= 3 && yearsExperience >= 2 ? 15 : 7;
  const criteriaText = [...(job?.criteria?.essential || []), ...(job?.criteria?.desirable || [])].join(' ');
  const evidenceScore = criteriaText && cvText ? Math.min(20, Math.round((criteriaText.split(/\s+/).filter(w => w.length > 5 && has(cvText.toLowerCase(), w.toLowerCase())).length / Math.max(1, criteriaText.split(/\s+/).filter(w => w.length > 5).length)) * 20)) : 0;
  const score = Math.min(100, Math.round(skillScore + roleScore + experienceScore + evidenceScore));
  return {score, matchedSkills, missingSkills, components:{skillScore:Math.round(skillScore), roleScore, experienceScore, evidenceScore}};
}
