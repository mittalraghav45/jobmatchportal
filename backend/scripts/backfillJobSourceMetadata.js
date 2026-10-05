import { fileURLToPath } from 'node:url';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';

const clean = value => String(value ?? '').trim();

export function resolveJobSourceMetadata(job) {
  const raw = job.raw && typeof job.raw === 'object' ? job.raw : {};
  const rawSource = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const rawNested = raw.raw && typeof raw.raw === 'object' ? raw.raw : {};
  const rawNestedSource = rawNested.source && typeof rawNested.source === 'object' ? rawNested.source : {};
  const verification = job.verification && typeof job.verification === 'object' ? job.verification : {};
  const source = job.source && typeof job.source === 'object' ? job.source : {};

  const atsCandidates = [
    source.ats,
    rawSource.ats,
    rawNestedSource.ats,
    rawNested.ats,
    raw.ats
  ];
  const urlCandidates = [
    job.applyUrl,
    source.url,
    rawSource.url,
    rawNestedSource.url,
    rawNested.url,
    raw.url,
    verification.finalUrl,
    verification.sourceUrl
  ];

  const ats = atsCandidates
    .map(clean)
    .find(value => value && value.toLowerCase() !== '[object object]') || 'unknown';
  const url = urlCandidates
    .map(clean)
    .find(value => /^https?:\/\//i.test(value)) || '';

  return { ats: ats.toLowerCase(), url };
}

export async function backfillJobSourceMetadata({ dryRun = false, batchSize = Number(process.env.BACKFILL_BATCH_SIZE || 500) } = {}) {
  await connectMongo();

  const cursor = Job.find({ 'verification.status': 'live' })
    .lean()
    .cursor({ batchSize });

  let scanned = 0;
  let updated = 0;
  let withUrl = 0;
  let withAts = 0;
  let alreadyComplete = 0;
  const bulk = [];

  for await (const job of cursor) {
    scanned += 1;
    const { ats, url } = resolveJobSourceMetadata(job);
    const set = {};

    if ((!job.applyUrl || job.applyUrl === '') && url) {
      set.applyUrl = url;
      withUrl += 1;
    }

    if ((!job.source?.url || job.source.url === '') && url) {
      set['source.url'] = url;
    }

    if (!job.source?.ats || job.source.ats.toLowerCase() === '[object object]') {
      if (ats !== 'unknown') {
        set['source.ats'] = ats;
        withAts += 1;
      }
    }

    if (Object.keys(set).length === 0) {
      alreadyComplete += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      bulk.push({
        updateOne: {
          filter: { _id: job._id },
          update: { $set: set }
        }
      });

      if (bulk.length >= batchSize) {
        await Job.bulkWrite(bulk, { ordered: false });
        bulk.length = 0;
      }
    }
  }

  if (!dryRun && bulk.length) {
    await Job.bulkWrite(bulk, { ordered: false });
  }

  return { dryRun, scanned, updated, withUrl, withAts, alreadyComplete };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dryRun = process.argv.includes('--dry-run');
  const result = await backfillJobSourceMetadata({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
