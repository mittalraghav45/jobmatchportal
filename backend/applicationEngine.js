import { ALL_IN_ONE_CV_OPTIMISER_SYSTEM_PROMPT, CV_OUTPUT_CONTRACT } from './prompts/cvOptimisationPrompt.js';
import { PUBLIC_SECTOR_RULES, classifyPublicSectorOrganisation } from './prompts/publicSectorOptimisationPrompt.js';

const PUBLIC_SECTOR_TERMS = [
  'nhs', 'nhs trust', 'dwp', 'civil service', 'government department',
  'local authority', 'council', 'university', 'higher education',
  'public sector', 'public body'
];

const REQUIREMENT_PATTERNS = [
  /(?:experience|proficient|proficiency|knowledge|understanding|skills?|expertise)\s+(?:with|in|of)\s+([^.;\n]+)/gi,
  /\b(react(?:\.js)?|typescript|javascript|node(?:\.js)?|aws|azure|gcp|graphql|rest(?:ful)?|postgres(?:ql)?|mongodb|elasticsearch|kafka|rabbitmq|docker|kubernetes|php|python|java|\.net|c#|sql|playwright|jest|git|ci\/cd)\b/gi
];

function cleanPhrase(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,-]+|[\s,.:!?;:-]+$/g, '')
    .trim();
}

export function classifyApplication({ companyName = '', role = '', jobDescription = '' } = {}) {
  const source = `${companyName} ${role} ${jobDescription}`.toLowerCase();
  const publicSector = classifyPublicSectorOrganisation(source);
  const matchedTerms = PUBLIC_SECTOR_TERMS.filter(term => source.includes(term));
  return {
    type: publicSector.isPublicSector ? 'public-sector' : 'commercial',
    specialist: publicSector.isPublicSector ? 'nhs-public-sector' : 'all-in-one',
    isPublicSector: publicSector.isPublicSector,
    matchedTypes: [...new Set([...publicSector.matchedTypes, ...matchedTerms])]
  };
}

export function extractJobKeywords(jobDescription = '', limit = 15) {
  const text = String(jobDescription || '');
  const counts = new Map();
  const add = phrase => {
    const cleaned = cleanPhrase(phrase).toLowerCase();
    if (cleaned.length < 3 || cleaned.length > 70) return;
    counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
  };

  for (const pattern of REQUIREMENT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        const phrase = cleanPhrase(match[1]).split(/\b(?:and|or|plus|including|such as)\b/i)[0];
        add(phrase);
      } else if (match[0]) add(match[0]);
    }
  }

  for (const match of text.matchAll(/\b(?:React(?:\.js)?|TypeScript|JavaScript|Node(?:\.js)?|AWS|Azure|GCP|GraphQL|REST(?:ful)?|PostgreSQL|MongoDB|Elasticsearch|Kafka|RabbitMQ|Docker|Kubernetes|PHP|Python|Java|\.NET|C#|SQL|Playwright|Jest|Git|CI\/CD)\b/gi)) {
    add(match[0]);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

export function buildOptimisationRequest({ companyName = '', role = '', jobDescription = '', candidateEvidence = '', task = 'tailor the application materials' } = {}) {
  const classification = classifyApplication({ companyName, role, jobDescription });
  const systemPrompt = classification.isPublicSector ? PUBLIC_SECTOR_RULES : ALL_IN_ONE_CV_OPTIMISER_SYSTEM_PROMPT;
  const userPrompt = [
    `TASK\n${task}`,
    `ROLE\n${role}`,
    `COMPANY\n${companyName}`,
    `JOB MATERIAL\n${jobDescription}`,
    `CANDIDATE EVIDENCE\n${candidateEvidence}`,
    'Return only claims supported by the supplied evidence. Mark missing measurable results with explicit placeholders rather than guessing.'
  ].join('\n\n');

  return {
    classification,
    keywords: extractJobKeywords(jobDescription),
    systemPrompt,
    userPrompt,
    outputContract: CV_OUTPUT_CONTRACT
  };
}

export function buildStructuredApplicationMessages(input = {}) {
  const request = buildOptimisationRequest(input);
  const publicOutput = request.classification.isPublicSector
    ? 'For public-sector applications also return supportingStatement and evidenceMatrix, using the supplied criteria/word limit.'
    : 'For commercial applications, return supportingStatement as an empty string and evidenceMatrix as an empty array.';
  const outputInstruction = `Return JSON with these keys only: classification, keywords, skills, experienceBullets, projects, summary, coverLetter, supportingStatement, evidenceMatrix, evidenceGaps. ${publicOutput} Cover letter must be <= ${CV_OUTPUT_CONTRACT.maxCoverLetterWords} words. Keywords should contain exactly ${CV_OUTPUT_CONTRACT.keywordCount} items when the job material contains enough explicit requirements; otherwise return the available verified keywords. Never invent evidence. Use [X%], [X users] or another explicit placeholder when a metric is missing.`;

  return {
    classification: request.classification,
    keywords: request.keywords,
    messages: [
      { role: 'system', content: `${request.systemPrompt}\n\n${outputInstruction}` },
      { role: 'user', content: request.userPrompt }
    ]
  };
}
