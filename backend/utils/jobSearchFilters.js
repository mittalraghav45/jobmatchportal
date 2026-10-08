// Categories use role-title evidence, not incidental words in descriptions.
export const ROLE_CATEGORIES = {
  frontend: '\\b(?:frontend|front[- ]end|react|javascript|typescript|web)\\b',
  backend: '\\b(?:backend|back[- ]end|node(?:\\.js)?|php)\\b',
  fullstack: '\\bfull[- ]?stack\\b',
  software: '\\bsoftware\\s+(?:engineer|developer)\\b',
  cloud: '\\b(?:cloud|devops|platform|infrastructure|site reliability|sre)\\b',
  data: '\\b(?:data|machine learning|ml|ai)\\b',
  security: '\\b(?:cyber|cybersecurity|security)\\b',
  qa: '\\b(?:qa|quality assurance|test|automation)\\b'
};

export function addJobSearchFilters(filter, query = {}) {
  const city = String(query.city || '').trim();
  if (city) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match whole city names: York must not match Yorkshire.
    filter.$and.push({ location: { $regex: `\\b${escaped}\\b`, $options: 'i' } });
  }
  const category = String(query.category || 'all').trim().toLowerCase();
  if (category === 'all') return;
  if (!Object.hasOwn(ROLE_CATEGORIES, category)) {
    const error = new Error('category must be all, frontend, backend, fullstack, software, cloud, data, security, or qa');
    error.code = 'INVALID_CATEGORY';
    throw error;
  }
  filter.$and.push({ title: { $regex: ROLE_CATEGORIES[category], $options: 'i' } });
}
