import fs from 'node:fs';

const logPath = process.argv[2] || 'nightly-matching.log';
const text = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';

function extractPayload(input) {
  const lines = input.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '{') continue;
    try { return JSON.parse(lines.slice(i).join('\n').trim()); } catch { /* continue */ }
  }
  return null;
}

const data = extractPayload(text);
if (!data) {
  console.log('# JobMatchPortal nightly quality report\n\n❌ No machine-readable matcher payload was found.');
  process.exit(0);
}

const c = data.classification || {};
const eligible = data.eligibleCounts || {};
const calibration = data.calibration || {};
const top = calibration.topMatches || [];
const total = Number(data.inputJobs || 0);
const eligibleJobs = Number(calibration.eligibleJobs || 0);
const pct = (n, d) => d ? `${((Number(n || 0) / d) * 100).toFixed(1)}%` : '0.0%';
const fmt = n => Number(n || 0).toLocaleString('en-GB');
const strong = Number(eligible.strong || 0);
const strongUnknown = Number(eligible.strong_unconfirmed_sponsorship || 0);
const possible = Number(eligible.possible || 0);
const weak = Number(eligible.weak || 0);
const exclusionTotal = Object.values(data.exclusionReasons || {}).reduce((a, b) => a + Number(b || 0), 0);

const scoreRows = Object.entries(calibration.scoreDistribution || {})
  .sort(([a], [b]) => Number(a.split('-')[0]) - Number(b.split('-')[0]))
  .map(([bucket, n]) => `| ${bucket} | ${fmt(n)} |`).join('\n') || '| No eligible jobs | 0 |';

const topRows = top.length ? top.map((job, i) => {
  const comp = job.components || {};
  return `### ${i + 1}. ${job.title || 'Untitled'} — ${job.companyName || 'Unknown company'}\n- **Score:** ${job.matchScore ?? 'n/a'}\n- **Fit:** \`${job.applicationFit || 'unknown'}\`\n- **Role:** \`${comp.roleCompatibilityStatus || 'unknown'}\`\n- **Skills:** ${comp.skills ?? 'n/a'}\n- **Experience:** \`${comp.experienceStatus || 'unknown'}\`\n- **Seniority:** ${comp.seniority ?? 'n/a'}\n- **Sponsorship:** \`${comp.sponsorshipStatus || 'unknown'}\`\n- **Reasons:** ${(job.reasons || []).join(', ') || 'none'}\n- **Location:** ${job.location || 'unknown'}\n- **Apply:** ${job.applyUrl || 'not available'}`;
}).join('\n\n') : '_No eligible matches were produced._';

console.log(`# JobMatchPortal nightly quality report

## Run

- Profile: \`${data.profileId || 'default'}\`
- Profile version: \`${data.profileVersion || 'unknown'}\`
- Matcher: \`${data.matcherVersion || 'unknown'}\`
- Mode: \`${data.mode || 'unknown'}\`
- Input jobs: **${fmt(total)}**
- Processed: **${fmt(data.processed)}**
- Eligible UK jobs: **${fmt(eligibleJobs)}** (${pct(eligibleJobs, total)})

## Corpus health

| Signal | Count | % of corpus |
|---|---:|---:|
| UK | ${fmt(c.uk)} | ${pct(c.uk, total)} |
| Non-UK / ambiguous | ${fmt(c.nonUk)} | ${pct(c.nonUk, total)} |
| Live | ${fmt(c.live)} | ${pct(c.live, total)} |
| Not live | ${fmt(c.notLive)} | ${pct(c.notLive, total)} |
| Verified | ${fmt(c.verified)} | ${pct(c.verified, total)} |
| Unverified | ${fmt(c.unverified)} | ${pct(c.unverified, total)} |
| Source processing complete | ${fmt(c.sourceProcessingComplete)} | ${pct(c.sourceProcessingComplete, total)} |

## Match distribution — eligible UK pool

| Classification | Count | % of eligible |
|---|---:|---:|
| 🟢 Strong | ${fmt(strong)} | ${pct(strong, eligibleJobs)} |
| 🟢 Strong, sponsorship unconfirmed | ${fmt(strongUnknown)} | ${pct(strongUnknown, eligibleJobs)} |
| 🟡 Possible | ${fmt(possible)} | ${pct(possible, eligibleJobs)} |
| 🔴 Weak | ${fmt(weak)} | ${pct(weak, eligibleJobs)} |

**Strong total:** ${fmt(strong + strongUnknown)} (${pct(strong + strongUnknown, eligibleJobs)} of eligible jobs).

> Sponsorship is a separate readiness signal. Unconfirmed sponsorship does not mean the employer sponsors Skilled Worker visas.

## Score distribution

| Score bucket | Jobs |
|---|---:|
${scoreRows}

## Top ${top.length} eligible matches

${topRows}

## Calibration flags

- Explicit exclusion reasons recorded: **${fmt(exclusionTotal)}**
- Specialist mismatches in top matches: **${top.filter(x => ['specialisation_mismatch', 'specialist_mismatch'].includes(x.components?.roleCompatibilityStatus)).length}**
- High-skill (≥80) jobs still weak in top matches: **${top.filter(x => Number(x.components?.skills || 0) >= 80 && x.applicationFit === 'weak').length}**

## Next action

Do not tune the matcher from a single job. Compare this report with the previous full-corpus run and inspect representative Strong, Possible and Weak jobs before making systematic changes.
`);
