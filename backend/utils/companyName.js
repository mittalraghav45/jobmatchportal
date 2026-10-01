export function cleanCompanyName(value) {
  const name = String(value ?? '').trim();
  if (!name) return '';
  if (/^(unknown|unknown company|n\/a|na|null|undefined)$/i.test(name)) return '';
  return name.replace(/\s{2,}/g, ' ').trim();
}

export function extractCompanyName(raw = {}) {
  const candidates = [
    raw.companyName,
    raw.company_name,
    raw.employerName,
    raw.employer_name,
    raw.company?.name,
    raw.employer?.name,
    raw.organisationName,
    raw.organizationName
  ];

  for (const candidate of candidates) {
    const name = cleanCompanyName(candidate);
    if (name) return name;
  }

  return '';
}
