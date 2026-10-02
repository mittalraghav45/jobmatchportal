import 'dotenv/config';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';

function firstHttpUrl(...values) {
  const queue = values.flat();
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (typeof value === 'string') {
      const url = value.trim();
      if (/^https?:\/\//i.test(url)) return url;
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of ['application', 'apply', 'job', 'source', 'applicationUrl', 'application_url', 'applyUrl', 'apply_url', 'atsUrl', 'ats_url', 'jobUrl', 'job_url', 'url']) {
      if (value[key] !== undefined) queue.push(value[key]);
    }
  }
  return '';
}

function pickDate(raw, kind) {
  const keys = kind === 'posted'
    ? ['postedAt', 'posted_date', 'posting_date', 'posted', 'datePosted', 'date_posted', 'datePublished']
    : ['closingAt', 'closing_date', 'closing_date_time', 'closing', 'validThrough', 'valid_through', 'deadline', 'closingDate', 'dateClosing'];
  const queue = [raw];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of keys) {
      const candidate = value[key];
      if (candidate instanceof Date) return candidate;
      if (typeof candidate === 'string' && candidate.trim() && !Number.isNaN(new Date(candidate).getTime())) return new Date(candidate);
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') queue.push(child);
  }
  return null;
}

function liveState(raw) {
  const isLive = raw?.isLive ?? raw?.status?.isLive;
  const state = typeof raw?.status === 'object' ? raw.status?.liveState : raw?.status;
  if (isLive === true || state === 'live' || state === 'open') return { isLive: true, liveState: 'live' };
  if (isLive === false || state === 'closed' || state === 'expired') return { isLive: false, liveState: 'closed' };
  return { isLive: null, liveState: 'unknown' };
}

async function main() {
  await connectMongo();
  const cursor = Job.find({}).select('_id source dates status raw').lean().cursor();
  let scanned = 0;
  let changed = 0;
  let sourceUrls = 0;
  let postedDates = 0;
  let closingDates = 0;
  let explicitLive = 0;
  let explicitClosed = 0;

  for await (const job of cursor) {
    scanned += 1;
    const raw = job.raw || {};
    const url = job.source?.url || firstHttpUrl(raw, raw.source);
    const postedAt = job.dates?.postedAt || pickDate(raw, 'posted');
    const closingAt = job.dates?.closingAt || pickDate(raw, 'closing');
    const live = liveState(raw);
    const set = {};

    if (url && !job.source?.url) { set['source.url'] = url; sourceUrls += 1; }
    if (postedAt && !job.dates?.postedAt) { set['dates.postedAt'] = postedAt; postedDates += 1; }
    if (closingAt && !job.dates?.closingAt) { set['dates.closingAt'] = closingAt; closingDates += 1; }
    if (live.liveState !== 'unknown' && job.status?.liveState !== live.liveState) { set['status.liveState'] = live.liveState; set['status.isLive'] = live.isLive; if (live.isLive) explicitLive += 1; else explicitClosed += 1; }

    if (Object.keys(set).length) {
      await Job.updateOne({ _id: job._id }, { $set: set });
      changed += 1;
    }
  }

  console.log('=== JOB METADATA REPAIR ===');
  console.table({ scanned, changed, sourceUrlsRecovered: sourceUrls, postedDatesRecovered: postedDates, closingDatesRecovered: closingDates, liveStatesRecovered: explicitLive, closedStatesRecovered: explicitClosed });
  await Job.db.close();
}

main().catch(error => {
  console.error('JOB METADATA REPAIR FAILED:', error.message);
  process.exit(1);
});
