// cvJobMatcher.js - CV Match %, Recommendation, Dates, Live Listings
// Own logic > Perplexity for live dates. Perplexity only fallback.

// cvJobMatcher.js - Full UK version - Raghav Mittal - MSc Southampton - 2+ years React/TS/Node
export const TECH_STACK_KEYWORDS = [
  'react','react.js','next.js','nextjs','node.js','nodejs','typescript','javascript','python',
  'java','aws','azure','gcp','docker','kubernetes','graphql','rest','rest api','sql','mongodb',
  'postgres','postgresql','redis','tailwind','tailwind css','redux','vue','angular','php',
  'elasticsearch','kibana','rabbitmq','kafka','jest','playwright','git','github actions','ci/cd',
  'openai','gpt api','firebase','material ui','json server','tmdb api','nextjs','express',
  'spring boot','django','flask','laravel','symfony'
];

export function parseCV(cvText) {
  const lower = (cvText||'').toLowerCase();
  const skills = TECH_STACK_KEYWORDS.filter(k => lower.includes(k));
  const expMatch = lower.match(/(\d+)\+?\s*years?/);
  const years = expMatch ? parseInt(expMatch[1]) : 2;
  return { 
    skills: [...new Set(skills.length ? skills : ['react','next.js','typescript','node.js','javascript','mongodb','aws','python'])], 
    years, 
    raw: cvText,
    name: 'Raghav Mittal',
    role: 'Full-Stack Engineer'
  };
}

export function calculateMatchPercent(cvSkills, jobDescription, jobTitle) {
  if (!jobDescription && !jobTitle) return 0;
  const jdLower = ((jobDescription||'') + ' ' + (jobTitle||'')).toLowerCase();
  let matched = 0;
  const total = cvSkills.length || 1;
  cvSkills.forEach(skill => {
    if (jdLower.includes(skill.toLowerCase())) matched++;
  });
  let bonus = 0;
  if (jdLower.includes('react') && cvSkills.some(s=> s.includes('react'))) bonus += 10;
  if (jdLower.includes('node') && cvSkills.some(s=> s.includes('node'))) bonus += 10;
  if (jdLower.includes('typescript') && cvSkills.some(s=> s.includes('typescript'))) bonus += 5;
  return Math.min(100, Math.round((matched / total) * 100 + bonus));
}

export function getRecommendation(matchPercent, isHiring, closingDate, visaSponsors = true) {
  const now = new Date();
  const close = closingDate ? new Date(closingDate) : null;
  if (close && close < now) return { shouldApply: false, reason: `Closed on ${close.toLocaleDateString()}`, priority: 'Closed', label: 'Closed', color: 'bg-red-900 text-red-300' };
  if (matchPercent >= 80) return { shouldApply: true, reason: `Excellent ${matchPercent}% - Apply now!`, priority: 'High', label: 'Apply now - Excellent', color: 'bg-green-600 text-white' };
  if (matchPercent >= 60) return { shouldApply: true, reason: `Good ${matchPercent}% - Worth applying`, priority: 'Medium', label: 'Apply - Good match', color: 'bg-yellow-600 text-white' };
  if (matchPercent >= 40) return { shouldApply: true, reason: `Partial ${matchPercent}%`, priority: 'Low', label: 'Consider', color: 'bg-zinc-600 text-white' };
  return { shouldApply: false, reason: `Low match ${matchPercent}%`, priority: 'Low', label: `Low match ${matchPercent}%`, color: 'bg-zinc-700 text-zinc-400' };
}

export function generateLatexCV({ companyName, role, jobDescription, cvSkills }) {
  const matched = (cvSkills||[]).filter(s => (jobDescription||'').toLowerCase().includes(s.toLowerCase()));
  const skillsStr = matched.length ? matched.join(' \\skillsep ') : (cvSkills||[]).slice(0,10).join(' \\skillsep ');
  return `%-------------------------
% Jake's Resume - Tailored for ${companyName} - ${role}
% Match: ${matched.length}/${(cvSkills||[]).length}
%------------------------
\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[margin=0.5in]{geometry}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}
\\pagestyle{fancy}\\fancyhf{}\\renewcommand{\\headrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}\\addtolength{\\textheight}{1.0in}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\pdfgentounicode=1
\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\ \\textit{\\small#3} & \\textit{\\small #4} \\\\ \\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}
\\newcommand{\\skillsep}{\\hspace{2pt}\\textbar{}\\hspace{2pt}\\allowbreak}
\\begin{document}
\\begin{center}
\\textbf{\\Huge \\scshape Raghav Mittal} \\\\ \\vspace{4pt}
\\small ${role} | ${companyName} Tailored | UK \\\\
\\small +44 7741910196 $|$ mittalraghav45@gmail.com $|$ linkedin.com/in/raghav-mittal-dev $|$ github.com/mittalraghav45
\\end{center}
\\section{Summary}
\\small Analytical professional with 2+ years building platforms for 8M+ users, tailored for ${role} at ${companyName}. MSc Computer Science Southampton. Strong match on ${matched.join(', ') || (cvSkills||[]).slice(0,5).join(', ')}.
\\section{Technical Skills}
\\begin{itemize}[leftmargin=0in, label={}, itemsep=6pt]
\\small
\\item{\\textbf{Matched for this role:} ${skillsStr}}
\\item{\\textbf{Full Stack:} React.js \\skillsep Next.js \\skillsep Node.js \\skillsep TypeScript \\skillsep JavaScript \\skillsep Python \\skillsep SQL \\skillsep MongoDB \\skillsep PostgreSQL \\skillsep Elasticsearch \\skillsep AWS \\skillsep Docker}
\\end{itemize}
\\section{Experience}
\\resumeSubHeadingListStart
\\resumeSubheading{Software Engineer}{Jun 2021 -- Aug 2023}{IndiaMART InterMESH Ltd}{}
\\resumeItemListStart
\\resumeItem{Scaled Seller Academy to 100k monthly users using Node.js, React, Next.js, MongoDB - relevant to ${companyName}}
\\resumeItem{Enhanced Tender Platform with ${matched.join(', ') || 'React, Node.js'} - 15\\% transaction increase}
\\resumeItem{Reduced infra costs 15\\% via duplicate-detection, Kibana, cron optimization}
\\resumeItemListEnd
\\resumeSubHeadingListEnd
\\section{Projects}
\\resumeSubHeadingListStart
\\resumeSubheading{MovieFlix -- AI-Powered}{React, Redux, OpenAI GPT API}{}
\\resumeSubheading{Cloud Surgery -- Healthcare Portal}{React, Material UI}{}
\\resumeSubHeadingListEnd
\\section{EDUCATION}
\\resumeSubHeadingListStart
\\resumeSubheading{University of Southampton -- MSc Computer Science -- Merit}{Sep 2023 -- Dec 2024}{Southampton, UK}{}
\\resumeSubHeadingListEnd
\\end{document}
`;
}

export function generateCoverLetter({ companyName, role, location, jobDescription, hiringManager = 'Hiring Team' }) {
  return `Raghav M
Front-end Software Engineer | React | TypeScript | Next.js
London, UK | linkedin.com/in/raghav-mittal-dev | github.com/mittalraghav45

Dear ${hiringManager},

I am writing to express my interest in the ${role} role at ${companyName}${location ? ` in ${location}` : ''}. With 2+ years building scalable platforms using Node.js, TypeScript, JavaScript and React serving 100k+ users, I am excited to contribute to ${companyName}.

In my previous role at IndiaMART, I developed enterprise platforms supporting 100k monthly users, contributing to 15% transaction increase and 15% lower CMS costs.

I have read the job description${jobDescription ? ` (${jobDescription.slice(0,150)}...)` : ''} and believe my experience aligns with:

1. Node.js and scalable development: Seller Academy using Node.js, React, Next.js, MongoDB scaling to 100k users.
2. Robust engineering: Re-engineered tender uploads with duplicate detection, RabbitMQ, reducing costs 15%, CI/CD GitHub Actions, Jest, Playwright.
3. AI and API integration: MovieFlix AI app integrating OpenAI GPT API and TMDB REST API.
4. Agile delivery: Agile teams, code reviews, collaboration with Marketing.

With MSc Computer Science Southampton, I bring hands-on experience across backend, frontend, cloud, CI/CD and AI applications. I would welcome opportunity to contribute to ${companyName}${location ? ` in ${location}` : ''}.

Best regards,
Raghav M
+44 7741910196 | mittalraghav45@gmail.com
`;
}
