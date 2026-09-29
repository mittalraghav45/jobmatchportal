/**
 * NHS / Public Sector application optimisation rules.
 *
 * Deliberately separate from the commercial CV optimiser because NHS, DWP,
 * Civil Service, universities and councils often assess against explicit
 * person specifications, essential criteria and application questions.
 */

export const PUBLIC_SECTOR_TYPES = [
  'NHS',
  'NHS Trust',
  'DWP',
  'Civil Service',
  'Government',
  'University',
  'Higher Education',
  'Local Authority',
  'Council',
  'Public Body',
  'Public Sector'
];

export const PUBLIC_SECTOR_RULES = `
You are a UK NHS and public-sector application specialist.

Optimise applications for NHS organisations, NHS Trusts, DWP, Civil Service,
UK government departments, universities, higher-education institutions,
local authorities/councils and comparable public bodies.

Use British English. Preserve the candidate's factual chronology, employers,
qualifications, responsibilities, tools and achievements. Never invent NHS,
Civil Service, DWP, university or public-sector experience. Never invent
metrics, outcomes, stakeholders, policies, systems or values.

When a person specification or selection criteria is supplied:
1. Separate essential and desirable criteria when the source distinguishes them.
2. Map each criterion to explicit candidate evidence.
3. Identify evidence gaps rather than filling them with assumptions.
4. Turn supported evidence into concise, outcome-focused examples.
5. Use STAR-style structure where it improves clarity, without forcing every
   sentence into a formula.
6. Preserve the candidate's actual scope and seniority.
7. Use relevant terminology from the vacancy naturally; do not keyword-stuff.
8. Distinguish transferable skills from direct sector experience.
9. If a metric is genuinely needed but absent, use [X%], [X users], [X projects]
   or another clearly labelled placeholder and tell the user to verify it.
10. Do not present placeholders as facts.

For NHS applications, use NHS-specific terminology only when supported by the
vacancy or candidate evidence. Do not claim NHS values, clinical experience,
patient-facing experience, safeguarding experience or healthcare governance
experience unless the supplied evidence supports the claim.

For Civil Service/DWP applications, identify stated behaviours, strengths,
experience requirements, technical criteria and Success Profiles-style evidence
when present. Do not assume a grade or framework unless the vacancy states it.

For universities, councils and other public bodies, follow the actual person
specification, competency framework, values and application questions supplied
by the user. Do not substitute a generic public-sector framework.

For supporting/personal statements:
- Answer the stated criteria directly.
- Lead with evidence rather than generic motivation.
- Use specific actions and outcomes.
- Keep paragraphs concise and recruiter-readable.
- Avoid unsupported claims such as 'passionate', 'excellent' or 'outstanding'
  unless backed by evidence.
- Respect any stated word/character limit exactly.

Output should be practical and evidence-led. Where evidence is missing, show
what information the candidate should add rather than fabricating it.
`;

export function classifyPublicSectorOrganisation(text = '') {
  const value = String(text || '').toLowerCase();
  const matches = PUBLIC_SECTOR_TYPES.filter(type => value.includes(type.toLowerCase()));
  return { isPublicSector: matches.length > 0, matchedTypes: matches };
}

export function extractCriteria(text = '') {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^[\s•*-]+/, '').trim())
    .filter(Boolean);

  const essential = [];
  const desirable = [];
  let section = null;

  for (const line of lines) {
    if (/essential (criteria|requirements)|essential/i.test(line)) {
      section = 'essential';
      continue;
    }
    if (/desirable (criteria|requirements)|desirable/i.test(line)) {
      section = 'desirable';
      continue;
    }
    if (section === 'essential' && line.length > 8) essential.push(line);
    if (section === 'desirable' && line.length > 8) desirable.push(line);
  }

  return { essential, desirable };
}

// Generic words add almost no evidential value. Matching only one of these
// caused false positives such as "Experience with Python" matching a CV that
// merely contained the word "experience".
const GENERIC_CRITERIA_WORDS = new Set([
  'experience', 'experienced', 'working', 'worked', 'work', 'ability',
  'knowledge', 'understanding', 'skills', 'skill', 'capable', 'demonstrated',
  'demonstrate', 'proven', 'strong', 'good', 'excellent', 'effective',
  'relevant', 'including', 'using', 'use', 'with', 'and', 'the', 'for',
  'within', 'across', 'through', 'have', 'having'
]);

function normaliseEvidenceText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(criterion) {
  return normaliseEvidenceText(criterion)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 4 && !GENERIC_CRITERIA_WORDS.has(token));
}

export function buildEvidenceMatrix(criteria = [], candidateText = '') {
  const evidence = normaliseEvidenceText(candidateText);
  const evidenceTokens = new Set(evidence.split(' ').filter(Boolean));

  return criteria.map(criterion => {
    const criterionText = normaliseEvidenceText(criterion);
    const tokens = meaningfulTokens(criterion);

    // Prefer an exact phrase match when the criterion is specific enough.
    const phraseMatch = criterionText.length >= 8 && evidence.includes(criterionText);
    const tokenMatches = tokens.filter(token => evidenceTokens.has(token));

    // A single meaningful token is enough for concrete technologies,
    // qualifications and domain terms. For generic business criteria, require
    // two meaningful tokens so broad words do not create false positives.
    const concreteToken = tokens.some(token =>
      /^(react|reactjs|typescript|javascript|node|nodejs|python|java|\.net|csharp|php|sql|mongodb|postgresql|aws|azure|gcp|docker|kubernetes|graphql|kafka|rabbitmq|html|css|redux|jest|playwright|git|linux|api|apis|agile|scrum|wcag|accessibility|security|cybersecurity|healthcare|nhs|dwp|civil|service|university|higher|education|stakeholders?)$/.test(token)
    );
    const supported = phraseMatch || (concreteToken && tokenMatches.length >= 1) || (!concreteToken && tokenMatches.length >= 2);

    return {
      criterion,
      supported,
      matchedTerms: tokenMatches,
      note: supported
        ? 'Supported by supplied candidate evidence; review the exact wording before submission.'
        : 'No sufficiently specific supplied evidence was found. Add verified evidence rather than assuming it.'
    };
  });
}
