import 'dotenv/config';
import { spawn } from 'node:child_process';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const batchSize = Math.max(1, Number(arg('batch-size', process.env.DISCOVERY_BATCH_SIZE || 100)) || 100);
const maxBatches = Math.max(1, Number(arg('max-batches', process.env.DISCOVERY_MAX_BATCHES || 20)) || 20);
const delayMs = Math.max(0, Number(arg('batch-delay-ms', process.env.DISCOVERY_BATCH_DELAY_MS || 5000)) || 5000);

function runBatch(skip) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-r', 'dotenv/config', 'scripts/nightlyDiscovery.js', `--skip=${skip}`, `--limit=${batchSize}`], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'inherit']
    });

    let stdout = '';
    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.on('error', reject);
    child.on('close', code => {
      const marker = '=== UNIFIED NIGHTLY DISCOVERY SUMMARY ===';
      const index = stdout.lastIndexOf(marker);
      if (index < 0) return reject(new Error(`Discovery batch at skip=${skip} produced no summary`));
      try {
        const summary = JSON.parse(stdout.slice(index + marker.length).trim());
        resolve({ code, summary });
      } catch (error) {
        reject(new Error(`Invalid discovery summary at skip=${skip}: ${error.message}`));
      }
    });
  });
}

const total = {
  batches: 0,
  requested: 0,
  selected: 0,
  successful: 0,
  failed: 0,
  unconfigured: 0,
  invalid: 0,
  discovered: 0,
  added: 0,
  updated: 0,
  duplicatesRemoved: 0,
  rejected: 0
};

for (let batch = 0; batch < maxBatches; batch += 1) {
  const skip = batch * batchSize;
  const { code, summary } = await runBatch(skip);

  total.batches += 1;
  for (const key of Object.keys(total).filter(key => key !== 'batches')) {
    total[key] += Number(summary[key] || 0);
  }

  if (code !== 0) {
    throw new Error(`Discovery batch failed at skip=${skip}`);
  }

  if (summary.selected < batchSize) break;
  if (batch < maxBatches - 1 && delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
}

const failureRate = total.selected ? total.failed / total.selected : 0;
const healthFailures = [];
if (total.selected === 0) healthFailures.push('no companies selected across full discovery');
if (failureRate > 0.10) healthFailures.push(`failure rate ${(failureRate * 100).toFixed(1)}% exceeds 10%`);
if (total.invalid > 0) healthFailures.push(`invalid companies=${total.invalid}`);

console.log('=== FULL NIGHTLY DISCOVERY SUMMARY ===');
console.log(JSON.stringify({
  ...total,
  failureRate,
  health: healthFailures.length ? 'failed' : 'passed',
  healthFailures
}, null, 2));

if (healthFailures.length) process.exit(1);
