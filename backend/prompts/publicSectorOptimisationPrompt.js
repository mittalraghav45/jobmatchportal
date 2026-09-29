/**
 * NHS / Public Sector application optimisation rules.
 *
 * This is deliberately separate from the commercial CV optimiser. It is used
 * for NHS, DWP, Civil Service, universities, councils and comparable UK
 * public-sector applications where person specifications, essential criteria
 * and supporting statements are commonly central to assessment.
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
experience requirements, technical criteria and success-profile-style evidence
when present. Do not assume a particular grade or framework unless the vacancy
states it.

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
  const matches = PUBLIC_SECTOR_TYPES.filter(type =>
    value.includes(type.toLowerCase())
  );
  return {
    isPublicSector: matches.length > 0,
    matchedTypes: matches
  };
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

export function buildEvidenceMatrix(criteria = [], candidateText = '') {
  const evidence = String(candidateText || '').toLowerCase();
  return criteria.map(criterion => ({
    criterion,
    supported: criterion
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/i)
      .filter(token => token.length >= 5)
      .some(token => evidence.includes(token)),
    note: 'Review manually and replace/add evidence where required.'
  }));
}
