import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname, '..');

const requiredDocs = [
  'AGENTS.md',
  'README.md',
  'docs/ARCHITECTURE.md',
  'docs/API.md',
  'docs/DATA_PIPELINE.md',
  'docs/OPERATIONS.md',
  'docs/PROJECT_STATUS.md',
  'docs/PROJECT_HANDOFF.md',
  'docs/DOCUMENTATION_POLICY.md'
];

const missing = requiredDocs.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing required documentation:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const changedFiles = (() => {
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], {
      cwd: root,
      encoding: 'utf8'
    }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
})();

const docs = new Set(requiredDocs);
const changed = new Set(changedFiles);
const rules = [
  {
    name: 'backend architecture/data pipeline',
    matches: (file) => file.startsWith('backend/') && !file.startsWith('backend/tests/'),
    required: ['docs/ARCHITECTURE.md', 'docs/DATA_PIPELINE.md']
  },
  {
    name: 'API implementation',
    matches: (file) => /(^|\/)server\.js$|(^|\/)routes\//.test(file),
    required: ['docs/API.md']
  },
  {
    name: 'workflow/operations',
    matches: (file) => file.startsWith('.github/workflows/'),
    required: ['docs/OPERATIONS.md']
  },
  {
    name: 'discovery/verification implementation',
    matches: (file) => /discover|scrap|crawl|verif|canonical/i.test(file),
    required: ['docs/DATA_PIPELINE.md', 'docs/PROJECT_STATUS.md']
  }
];

const violations = [];
for (const rule of rules) {
  if (!changedFiles.some(rule.matches)) continue;
  const changedRequiredDoc = rule.required.some((file) => changed.has(file));
  if (!changedRequiredDoc) {
    violations.push(`${rule.name}: update at least one of ${rule.required.join(', ')}`);
  }
}

console.log(`Documentation inventory: ${docs.size} required documents present.`);
if (changedFiles.length) console.log(`Files changed in HEAD: ${changedFiles.length}`);

if (violations.length) {
  console.error('\nDocumentation consistency check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Documentation consistency check passed.');
