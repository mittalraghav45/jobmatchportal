// cvJobMatcher.js - CV Match %, Recommendation, Dates, Live Listings
// Own logic > Perplexity for live dates. Perplexity only fallback.

// cvJobMatcher.js - Updated for Raghav CV - 2+ years React/TS/Node/PHP/Mongo/ES
export const TECH_STACK_KEYWORDS = [
  'react','react.js','next.js','nextjs','node.js','nodejs','typescript','javascript','python',
  'java','aws','azure','gcp','docker','kubernetes','graphql','rest','rest api','sql','mongodb',
  'postgres','postgresql','redis','tailwind','tailwind css','redux','vue','angular','php',
  'elasticsearch','kibana','rabbitmq','kafka','jest','playwright','git','github actions','ci/cd',
  'openai','gpt api','firebase','material ui','json server','tmdb api'
];

export function parseCV(cvText) {
  const lower = (cvText||'').toLowerCase();
  const skills = TECH_STACK_KEYWORDS.filter(k => lower.includes(k));
  const expMatch = lower.match(/(\d+)\+?\s*years?/);
  const years = expMatch ? parseInt(expMatch[1]) : 2; // Raghav has 2+ years
  return { 
    skills: [...new Set(skills.length ? skills : ['react','next.js','typescript','node.js','javascript','mongodb','aws'])], 
    years, 
    raw: cvText,
    name: 'Raghav Mittal',
    role: 'Data & Technology Analyst | Full-Stack'
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
  const basePercent = (matched / total) * 100;
  return Math.min(100, Math.round(basePercent + bonus));
}

export function getRecommendation(matchPercent, isHiring, closingDate, visaSponsors = true) {
  const now = new Date();
  const close = closingDate ? new Date(closingDate) : null;
  if (close && close < now) return { shouldApply: false, reason: `Closed on ${close.toLocaleDateString()}`, priority: 'Closed', label: 'Closed', color: 'bg-red-900 text-red-300' };
  if (matchPercent >= 80) return { shouldApply: true, reason: `Excellent match ${matchPercent}% - Apply now!`, priority: 'High', label: 'Apply now - Excellent', color: 'bg-green-600 text-white' };
  if (matchPercent >= 60) return { shouldApply: true, reason: `Good match ${matchPercent}% - Worth applying`, priority: 'Medium', label: 'Apply - Good match', color: 'bg-yellow-600 text-white' };
  if (matchPercent >= 40) return { shouldApply: true, reason: `Partial match ${matchPercent}% - Apply if you have time`, priority: 'Low', label: 'Consider', color: 'bg-zinc-600 text-white' };
  return { shouldApply: false, reason: `Low match ${matchPercent}%`, priority: 'Low', label: `Low match ${matchPercent}%`, color: 'bg-zinc-700 text-zinc-400' };
}

// LaTeX CV Generator - Jake's template
export function generateLatexCV({ companyName, role, jobDescription, cvSkills }) {
  const matchedSkills = cvSkills.filter(s => jobDescription?.toLowerCase().includes(s.toLowerCase()));
  const skillsStr = matchedSkills.length ? matchedSkills.join(' \\skillsep ') : cvSkills.slice(0,10).join(' \\skillsep ');
  
  return `%-------------------------
% Jake's Resume Template - Final Curve Analytics Version
% Raghav Mittal | Tailored for ${companyName} - ${role}
% Match: ${matchedSkills.length}/${cvSkills.length} skills
%------------------------

\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[margin=0.5in]{geometry}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}
\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\pdfgentounicode=1

\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\ \\textit{\\small#3} & \\textit{\\small #4} \\\\ \\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2 \\\\ \\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}
\\newcommand{\\skillsep}{\\hspace{2pt}\\textbar{}\\hspace{2pt}\\allowbreak}

\\begin{document}

\\begin{center}
    \\textbf{\\Huge \\scshape Raghav Mittal} \\\\ \\vspace{4pt}
    \\small Data \\& Technology Analyst | ${role} | ${companyName} Tailored \\\\
    \\small +44 7741910196 $|$ \\href{mailto:mittalraghav45@gmail.com}{\\underline{mittalraghav45@gmail.com}} $|$ \\href{https://linkedin.com/in/raghav-mittal-dev}{\\underline{LinkedIn}} $|$ \\href{https://github.com/mittalraghav45}{\\underline{GitHub}}
\\end{center}

\\section{Summary}
\\small
Analytical professional with 2+ years building scalable platforms for 8M+ users, tailored for ${role} at ${companyName}. MSc Computer Science Southampton. Strong match on ${matchedSkills.join(', ') || cvSkills.slice(0,5).join(', ')} - ${jobDescription ? jobDescription.slice(0,200) : 'React/TypeScript/Node'}.

\\section{Technical Skills}
\\begin{itemize}[leftmargin=0in, label={}, itemsep=6pt, parsep=0pt, topsep=0pt]
\\small
\\item{\\textbf{Matched for this role:} ${skillsStr}}
\\item{\\textbf{Full Stack:} SQL \\skillsep Python \\skillsep JavaScript \\skillsep React.js \\skillsep Next.js \\skillsep Node.js \\skillsep TypeScript \\skillsep REST APIs \\skillsep MongoDB \\skillsep PostgreSQL \\skillsep Elasticsearch \\skillsep AWS \\skillsep GCP \\skillsep Docker}
\\end{itemize}

\\section{Experience}
\\resumeSubHeadingListStart
    \\resumeSubheading{Software Engineer}{Jun 2021 -- Aug 2023}{IndiaMART InterMESH Ltd -- Noida, India}{}
      \\resumeItemListStart
        \\resumeItem{\\textbf{Scaled Seller Academy to 100k monthly users} using Node.js, React, Next.js, MongoDB - relevant to ${companyName} ${role}}
        \\resumeItem{Enhanced Tender Platform with ${matchedSkills.join(', ') || 'React, Node.js'} contributing to 15\\% transaction increase}
        \\resumeItem{Reduced infrastructure costs 15\\% via duplicate-detection, Kibana dashboards, cron optimization}
      \\resumeItemListEnd
\\resumeSubHeadingListEnd

\\section{Projects}
\\resumeSubHeadingListStart
    \\resumeProjectHeading{\\textbf{MovieFlix -- AI-Powered Platform} $|$ \\emph{React, Redux, OpenAI GPT API, TMDB API}}{}
      \\resumeItemListStart
        \\resumeItem{Built AI recommendations platform - relevant to ${companyName} tech stack}
      \\resumeItemListEnd
\\resumeSubHeadingListEnd

\\section{EDUCATION}
\\resumeSubHeadingListStart
  \\resumeSubheading{University of Southampton, UK -- MSc Computer Science -- Merit}{Sep 2023 -- Dec 2024}{Southampton, UK}{}
  \\resumeSubheading{Amity University -- B.Tech CSE}{Sep 2017 -- Aug 2021}{Noida, India}{}
\\resumeSubHeadingListEnd

\\end{document}
`;
}

export function generateCoverLetter({ companyName, role, location, jobDescription, hiringManager = 'Hiring Team' }) {
  return `Raghav M
Front-end Software Engineer | React | TypeScript | Next.js
London, UK | LinkedIn: linkedin.com/in/raghav-mittal-dev | GitHub: github.com/mittalraghav45

Dear ${hiringManager},

I am writing to express my interest in the ${role} role at ${companyName}${location ? ` in ${location}` : ''}. With 2+ years of software engineering experience building scalable platforms using Node.js, TypeScript, JavaScript and React serving 100,000+ monthly users, I am excited by the opportunity to contribute to technology at ${companyName}.

In my previous role at IndiaMART, I developed and re-engineered enterprise platforms supporting 100,000 monthly users, while contributing to a 15% increase in transactions and 15% lower CMS infrastructure costs. This experience has strengthened my focus on scalable engineering, reliable delivery and measurable customer impact.

I have read the job description${jobDescription ? ` (${jobDescription.slice(0,150)}...)` : ''} and believe my experience aligns particularly well with the following areas:

1. Node.js and scalable software development: I developed the Seller Academy using Node.js, React.js, Next.js and MongoDB, scaling the platform to 100,000 monthly users. I also enhanced a core Tender Listing Platform using Node.js and related technologies, contributing to a 15% increase in transactions.

2. Robust engineering and continuous delivery: I re-engineered tender uploads using Node.js and RabbitMQ, introducing duplicate detection and parallel processing while reducing CMS infrastructure costs by 15%. I also supported AWS/GCP migration and CI/CD using GitHub Actions, alongside Jest, Playwright and code reviews.

3. AI and API integration: Through my MovieFlix project, I developed an AI-enabled customer-facing application integrating the OpenAI GPT API and TMDB REST API, using reusable components and API-driven workflows. This gives me practical experience relevant to ${companyName}'s technology and AI-focused environment.

4. Agile and collaborative delivery: I have worked within Agile software engineering teams, contributed to code reviews and documentation, and collaborated with Marketing when developing and tracking automated customer communications.

With 2+ years immersed in software engineering, alongside an MSc Computer Science from the University of Southampton, I bring hands-on development experience across backend, frontend, cloud migration, CI/CD and AI-enabled applications. I would welcome the opportunity to contribute these skills to ${companyName}'s team${location ? ` in ${location}` : ''}.

Thank you for considering my application. I look forward to discussing how my experience could contribute to the team.

Best regards,
Raghav M
+44 7741910196 | mittalraghav45@gmail.com
`;
}

