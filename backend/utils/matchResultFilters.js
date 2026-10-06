export const VALID_EMPLOYER_TYPES = Object.freeze(['private', 'councils', 'universities', 'nhs', 'dwp']);
export const VALID_NATIONS = Object.freeze(['England', 'Scotland', 'Wales', 'Northern Ireland', 'UK-wide']);
export const VALID_APPLICATION_FITS = Object.freeze(['strong', 'possible', 'weak', 'strong_unconfirmed_sponsorship']);

export function validateMatchResultFilters({ applicationFit, employerType, nation } = {}) {
  const fit = applicationFit ? String(applicationFit).toLowerCase() : undefined;
  const employer = employerType ? String(employerType).toLowerCase() : undefined;
  const selectedNation = nation ? String(nation) : undefined;

  if (fit && !VALID_APPLICATION_FITS.includes(fit)) {
    throw new Error(`applicationFit must be one of: ${VALID_APPLICATION_FITS.join(', ')}`);
  }
  if (employer && !VALID_EMPLOYER_TYPES.includes(employer)) {
    throw new Error(`employerType must be one of: ${VALID_EMPLOYER_TYPES.join(', ')}`);
  }
  if (selectedNation && !VALID_NATIONS.includes(selectedNation)) {
    throw new Error(`nation must be one of: ${VALID_NATIONS.join(', ')}`);
  }

  return { applicationFit: fit, employerType: employer, nation: selectedNation };
}

export function buildMatchResultJobFilter({ employerType, nation } = {}) {
  const filter = {};
  if (employerType) filter.employerType = employerType;
  if (nation) filter.nation = nation;
  return filter;
}
