// cvJobMatcher.js - deterministic CV/job matching and application generation

export const TECH_STACK_KEYWORDS = [
  'react', 'react.js', 'next.js', 'nextjs', 'node.js', 'nodejs', 'typescript', 'javascript',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'graphql', 'rest', 'rest api', 'sql', 'mongodb',
  'postgres', 'postgresql', 'redis', 'tailwind', 'tailwind css', 'redux', 'vue', 'angular', 'php',
  'elasticsearch', 'kibana', 'rabbitmq', 'kafka', 'jest', 'playwright', 'git', 'github actions',
  'ci/cd', 'openai', 'gpt api', 'express', 'spring boot', 'django', 'flask', 'laravel', 'symfony'
];

const NORMALISATIONS = new Map([
  ['react.js', 'react'], ['reactjs', 'react'], ['node.js', 'node'], ['nodejs', 'node'],
  ['next.js', 'next.js'], ['nextjs', 'next.js'], ['postgres', 'postgresql'], ['rest api', 'rest']
]);

function normaliseSkill(skill) {
  const value = String(skill || '').toLowerCase().trim();
  return NORMALISATIONS.get(value) || value;
}

function containsTerm(text, term) {
  const source = String(text || '').toLowerCase();
  const escaped = normaliseSkill(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(source);
}

export function parseCV(cvText) {
  const raw = String(cvText || '');
  const skills = TECH_STACK_KEYWORDS.filter(skill => containsTerm(raw, skill));
  const experienceMatches = [...raw.matchAll(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/gi)]
    .map(m => Number(m[1])).filter(Number.isFinite);
  const years = experienceMatches.length ? Math.max(...experienceMatches) : 0;
  const roleMatch = raw.match(/(?:software|full[- ]stack|frontend|front[- ]end|backend|back[- ]end)[^\n|]{0,50}(?:engineer|developer)/i);
  return { skills: [...new Set(skills)], years, raw, name: 'Raghav Mittal', role: roleMatch?.[0]?.trim() || 'Software Engineer' };
}

export function calculateMatchPercent(cvSkills = [], jobDescription = '', jobTitle = '') {
  const skills = [...new Set((cvSkills || []).map(normaliseSkill).filter(Boolean))];
  const text = `${jobTitle || ''} ${jobDescription || ''}`;
  if (!skills.length || !text.trim()) return 0;
  const matched = skills.filter(skill => containsTerm(text, skill));
  const skillScore = (matched.length / skills.length) * 70;
  const titleScore = /software engineer|software developer|full.?stack|frontend|front.?end|backend|back.?end|web developer|developer/i.test(jobTitle || '') ? 20 : 0;
  const techSignal = /react|typescript|javascript|node|aws|graphql|mongodb|postgres|elasticsearch|kafka|rabbitmq/i.test(text) ? 10 : 0;
  return Math.min(100, Math.round(skillScore + titleScore + techSignal));
}

export function getMatchBreakdown(cvSkills = [], jobDescription = '', jobTitle = '') {
  const skills = [...new Set((cvSkills || []).map(normaliseSkill).filter(Boolean))];
  const text = `${jobTitle || ''} ${jobDescription || ''}`;
  const matched = skills.filter(skill => containsTerm(text, skill));
  return {
    matchedSkills: matched,
    missingFromJob: skills.filter(skill => !containsTerm(text, skill)),
    skillCoverage: skills.length ? Math.round((matched.length / skills.length) * 100) : 0,
    roleAlignment: /software engineer|software developer|full.?stack|frontend|front.?end|backend|back.?end|web developer|developer/i.test(jobTitle || ''),
    score: calculateMatchPercent(skills, jobDescription, jobTitle)
  };
}

export function getRecommendation(matchPercent, isHiring = true, closingDate = null, visaSponsors = null) {
  const now = Date.now();
  const close = closingDate ? new Date(closingDate) : null;
  if (close && !Number.isNaN(close.getTime()) && close.getTime() < now) {
    return { shouldApply: false, reason: `Closed on ${close.toLocaleDateString('en-GB')}`, priority: 'Closed', label: 'Closed', color: 'bg-red-900 text-red-300' };
  }
  if (isHiring === false) return { shouldApply: false, reason: 'Job is not currently marked as hiring', priority: 'Unavailable', label: 'Not hiring', color: 'bg-zinc-700 text-zinc-300' };
  if (visaSponsors === false) return { shouldApply: false, reason: 'Employer is not marked as a sponsor', priority: 'Sponsorship', label: 'No sponsor licence', color: 'bg-zinc-700 text-zinc-300' };
  if (matchPercent >= 80) return { shouldApply: true, reason: `High match (${matchPercent}%)`, priority: 'High', label: 'High match', color: 'bg-green-600 text-white' };
  if (matchPercent >= 60) return { shouldApply: true, reason: `Good match (${matchPercent}%)`, priority: 'Medium', label: 'Good match', color: 'bg-yellow-600 text-white' };
  if (matchPercent >= 40) return { shouldApply: true, reason: `Partial match (${matchPercent}%)`, priority: 'Low', label: 'Partial match', color: 'bg-zinc-600 text-white' };
  return { shouldApply: false, reason: `Low match (${matchPercent}%)`, priority: 'Low', label: 'Low match', color: 'bg-zinc-700 text-zinc-400' };
}

function latexEscape(value = '') {
  return String(value)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1');
}

export function generateLatexCV({ companyName, role, jobDescription, cvSkills = [] }) {
  const breakdown = getMatchBreakdown(cvSkills, jobDescription, role);
  const matched = breakdown.matchedSkills.length ? breakdown.matchedSkills : cvSkills.slice(0, 8).map(normaliseSkill);
  const skillsStr = matched.join(' \\skillsep ');
  const safeCompany = latexEscape(companyName);
  const safeRole = latexEscape(role);
  return `% Tailored CV generated for ${safeCompany} - ${safeRole}\n\\documentclass[letterpaper,11pt]{article}\n\\usepackage[margin=0.5in]{geometry}\n\\usepackage{enumitem}\n\\usepackage[hidelinks]{hyperref}\n\\pagestyle{empty}\n\\newcommand{\\skillsep}{\\hspace{2pt}\\textbar{}\\hspace{2pt}\\allowbreak}\n\\begin{document}\n\\begin{center}\n{\\LARGE \\textbf{Raghav Mittal}}\\\\\n\\small Software Engineer | React | TypeScript | Node.js\\\\\n\\small Southampton, UK | mittalraghav45@gmail.com | raghavmittal.co.uk\\n\\end{center}\n\\section*{Summary}\nSoftware Engineer with 2+ years of professional web-development experience and an MSc Computer Science from the University of Southampton. Experience across React, TypeScript, Node.js, REST APIs, databases, AWS and automated testing.\\n\\section*{Technical Skills}\n\\textbf{Relevant to this vacancy:} ${skillsStr || 'React \\skillsep TypeScript \\skillsep Node.js'}\\\\\n\\textbf{Core:} React.js \\skillsep TypeScript \\skillsep JavaScript \\skillsep Node.js \\skillsep PHP \\skillsep PostgreSQL \\skillsep MongoDB \\skillsep Elasticsearch \\skillsep AWS \\skillsep Jest \\skillsep Playwright \\skillsep Git\\n\\section*{Experience}\n\\textbf{Software Engineer -- IndiaMART InterMESH Ltd}\\hfill 2021--2023\\n\\begin{itemize}[leftmargin=*]\n\\item Designed and improved web-platform workflows using JavaScript, React, Node.js and backend APIs.\\n\\item Architected the Tender Upload Process, including duplicate detection and parallel-upload handling.\\n\\item Revamped Latest Tender search and homepage experiences with location and category filtering.\\n\\item Migrated scheduled scripts to AWS and improved application and backend performance.\\n\\end{itemize}\n\\section*{Education}\n\\textbf{University of Southampton} -- MSc Computer Science, Merit\\hfill 2023--2024\\n\\end{document}`;
}

export function generateCoverLetter({ companyName, role, location }) {
  return `Dear Hiring Team,\n\nI am writing to apply for the ${role} position at ${companyName}${location ? ` in ${location}` : ''}. I am a Software Engineer with over two years of professional web-development experience and an MSc in Computer Science from the University of Southampton.\n\nAt IndiaMART InterMESH, I worked across frontend and backend development, including React, JavaScript, Node.js, APIs, databases, AWS and automated testing. I contributed to the architecture of the Tender Upload Process, improved search and filtering experiences, and migrated scheduled workloads to AWS.\n\nI am particularly interested in this opportunity because it aligns with my experience building production web applications and working across the full development lifecycle. I would welcome the opportunity to discuss how my experience could contribute to ${companyName}.\n\nKind regards,\nRaghav Mittal\nSouthampton, UK\nmittalraghav45@gmail.com\nraghavmittal.co.uk\n`;
}
