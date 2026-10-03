const TECH_ROLE_PATTERNS = [
  /\bsoftware\s+engineer\b/i,
  /\bsoftware\s+developer\b/i,
  /\b(?:frontend|front-end|front end)\s+(?:engineer|developer)\b/i,
  /\b(?:backend|back-end|back end)\s+(?:engineer|developer)\b/i,
  /\bfull[- ]?stack\s+(?:engineer|developer)\b/i,
  /\bweb\s+(?:engineer|developer)\b/i,
  /\b(?:javascript|typescript|react|node(?:\.js)?|php)\s+(?:engineer|developer)\b/i,
  /\b(?:devops|site reliability|sre)\s+(?:engineer|developer)\b/i,
  /\b(?:cloud|platform|infrastructure|systems?)\s+(?:engineer|developer)\b/i,
  /\bdata\s+(?:engineer|scientist|developer)\b/i,
  /\b(?:machine learning|ml|ai)\s+(?:engineer|developer|scientist)\b/i,
  /\b(?:cyber|cybersecurity|security)\s+(?:engineer|developer|analyst)\b/i,
  /\b(?:qa|quality assurance|test|automation)\s+(?:engineer|developer)\b/i,
  /\b(?:solutions|software|technical|cloud|systems?)\s+architect\b/i,
  /\b(?:database|dba)\s+(?:engineer|administrator)\b/i,
  /\b(?:release|build|reliability)\s+engineer\b/i,
  /\b(?:technical|technology|engineering)\s+(?:consultant|specialist|analyst)\b/i,
  /\b(?:engineering|technical)\s+manager\b/i,
  /\b(?:engineering|technology)\s+lead\b/i,
  /\bdeveloper\b/i,
  /\bprogrammer\b/i
];

const NON_TECH_ROLE_PATTERNS = [
  /\blegal\b/i, /\bcounsel\b/i, /\bsolicitor\b/i, /\blawyer\b/i,
  /\bcustomer\s+success\b/i, /\baccount\s+(?:manager|executive|director)\b/i,
  /\bsales\b/i, /\bbusiness\s+development\b/i, /\bmarketing\b/i,
  /\brecruit(?:er|ment)\b/i, /\bhuman\s+resources\b/i,
  /\bpeople\s+(?:partner|manager|advisor)\b/i, /\bfinance\b/i,
  /\bfinancial\b/i, /\b(?:payroll|procurement|purchasing)\b/i,
  /\b(?:compliance|risk)\s+(?:manager|analyst|officer)\b/i,
  /\boperations?\s+(?:manager|analyst|director|specialist)\b/i,
  /\bproject\s+manager\b/i, /\bproduct\s+manager\b/i,
  /\b(?:office|executive|personal)\s+assistant\b/i,
  /\bcommunications?\b/i, /\bpublic\s+relations\b/i
];

export function isTechJobTitle(title = '', department = '') {
  const value = `${String(title).trim()} ${String(department).trim()}`.trim();
  if (!value) return false;
  if (NON_TECH_ROLE_PATTERNS.some(pattern => pattern.test(value))) return false;
  return TECH_ROLE_PATTERNS.some(pattern => pattern.test(value));
}

export function techJobMongoFilter() {
  return {
    $and: [
      { $or: TECH_ROLE_PATTERNS.map(pattern => ({ title: { $regex: pattern.source, $options: 'i' } })) },
      { $nor: NON_TECH_ROLE_PATTERNS.map(pattern => ({ title: { $regex: pattern.source, $options: 'i' } })) }
    ]
  };
}
