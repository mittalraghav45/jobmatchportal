import fs from 'node:fs';

const logPath = process.argv[2] || 'nightly-matching.log';
const text = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';

function extractPayload(input) {
  const lines = input.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '{') continue;
    try { return JSON.parse(lines.slice(i).join('\n').trim()); } catch { /* keep searching */ }
  }
  return null;
}

const data = extractPayload(text);
if (!data) {
  console.error('Nightly quality gate: matcher payload not found.');
  process.exit(1);
}

const gate = data.qualityGate;
if (!gate) {
  console.error('Nightly quality gate: qualityGate payload not found.');
  process.exit(1);
}

console.log(`Nightly quality gate: ${gate.status}`);
console.log(`Strong checked: ${gate.strongCount}`);
console.log(`Critical violations: ${gate.criticalCount}`);
console.log(`Warnings: ${gate.warningCount}`);

if (gate.status !== 'PASS') {
  for (const issue of (gate.critical || []).slice(0, 20)) {
    console.error(`QUALITY_GATE_FAIL ${issue.issue}: ${issue.title || issue.jobId || 'unknown job'}`);
  }
  process.exit(1);
}
