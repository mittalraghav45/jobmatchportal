const NATION_PATTERNS = {
  Scotland: /\b(scotland|edinburgh|glasgow|aberdeen|dundee|stirling|inverness|perth|falkirk|paisley|livingston|hamilton|motherwell|cumbernauld|east kilbride|kilmarnock|ayr|coatbridge|greenock)\b/i,
  Wales: /\b(wales|cardiff|swansea|newport|wrexham|bangor|aberystwyth|llanelli|bridgend|neath|caerphilly|merthyr|pontypridd|port talbot|cwmbran)\b/i,
  'Northern Ireland': /\b(northern ireland|belfast|derry|londonderry|lisburn|newry|armagh|craigavon|newtownabbey|carrickfergus|antrim|newtownards|omagh|coleraine)\b/i,
  England: /\b(england|london|southampton|manchester|birmingham|bristol|leeds|liverpool|sheffield|nottingham|newcastle|reading|oxford|cambridge|brighton|bath|exeter|portsmouth|coventry|leicester|hull|york|milton keynes|luton|watford|guildford|winchester|chester|derby|norwich|plymouth|swindon|slough|croydon|hounslow|bournemouth|canterbury|cheltenham|gloucester|ipswich|lincoln|middlesbrough|northampton|peterborough|preston|salisbury|stoke-on-trent|sunderland|wakefield|wolverhampton|worcester)\b/i
};

const EMPLOYER_PATTERNS = {
  councils: /\b(council|borough council|city council|county council|district council|metropolitan borough|unitary authority|local authority|local government)\b/i,
  universities: /\b(university|universities|higher education|institute of technology|university of|college)\b/i,
  dwp: /\b(department for work and pensions|dwp)\b/i,
  nhs: /\bnhs\b|nhs trust|nhs foundation trust|health board|health and social care|nhs scotland|nhs england|nhs wales|nhs northern ireland/i
};

function flatten(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(' ');
  if (typeof value === 'object') return Object.values(value).map(flatten).join(' ');
  return '';
}

function firstMatchingNation(signals) {
  for (const [nation, pattern] of Object.entries(NATION_PATTERNS)) {
    if (pattern.test(signals)) return nation;
  }
  return null;
}

export function classifyNation({ location = '', company = {}, raw = {} } = {}) {
  const metadata = company?.metadata || {};

  // A specific job location takes precedence over a company's registered/office location.
  const jobLocationSignals = [location, raw.location, raw.region, raw.country]
    .map(flatten)
    .join(' ')
    .trim();
  const jobNation = firstMatchingNation(jobLocationSignals);
  if (jobNation) return jobNation;

  // Only use company metadata when the job location itself does not identify a nation.
  const companySignals = [
    metadata.location,
    metadata.address,
    metadata.region,
    metadata.country,
    metadata.city,
    metadata.postcode
  ].map(flatten).join(' ').trim();
  const companyNation = firstMatchingNation(companySignals);
  if (companyNation) return companyNation;

  // Generic UK/United Kingdom is not evidence that a job is in England.
  const explicitCountry = flatten(metadata.country || raw.country).trim().toLowerCase();
  if (explicitCountry === 'england') return 'England';

  return 'UK-wide';
}

export function classifyEmployerType({ company = {}, job = {}, raw = {} } = {}) {
  const metadata = company?.metadata || {};
  const signals = [
    company.companyName,
    company.companyNumber,
    metadata.name,
    metadata.legalName,
    metadata.industry,
    metadata.category,
    metadata.organisationType,
    metadata.organizationType,
    metadata.sector,
    metadata.description,
    job.title,
    job.department,
    raw.companyName,
    raw.employer,
    raw.organisation
  ].map(flatten).join(' ');

  if (EMPLOYER_PATTERNS.nhs.test(signals)) return 'nhs';
  if (EMPLOYER_PATTERNS.dwp.test(signals)) return 'dwp';
  if (EMPLOYER_PATTERNS.councils.test(signals)) return 'councils';
  if (EMPLOYER_PATTERNS.universities.test(signals)) return 'universities';
  return 'private';
}

export function classifyJob({ job = {}, company = {}, raw = {} } = {}) {
  return {
    nation: classifyNation({ location: job.location || raw.location, company, raw }),
    employerType: classifyEmployerType({ company, job, raw }),
    classificationVersion: 'v2'
  };
}
