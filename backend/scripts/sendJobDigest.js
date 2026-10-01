import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { scoreCandidateAgainstJob, analyseJob } from '../jobIntelligence.js';

dotenv.config();

const HOURS = Math.max(1, Number(process.env.JOB_DIGEST_HOURS || 24));
const MIN_SCORE = Math.max(0, Math.min(100, Number(process.env.JOB_DIGEST_MIN_SCORE || 65)));
const LIMIT = Math.max(1, Math.min(50, Number(process.env.JOB_DIGEST_LIMIT || 20)));
const TO = String(process.env.JOB_DIGEST_TO || '').trim();
const FROM = String(process.env.JOB_DIGEST_FROM || '').trim();
const SENDGRID_API_KEY = String(process.env.SENDGRID_API_KEY || '').trim();
const DRY_RUN = String(process.env.JOB_DIGEST_DRY_RUN || 'false').toLowerCase() === 'true';

const deliverySchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true },
  sentAt: { type: Date, default: Date.now }
}, { collection: 'job_digest_deliveries', versionKey: false });
const JobDigestDelivery = mongoose.models.JobDigestDelivery || mongoose.model('JobDigestDelivery', deliverySchema);

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

async function sendEmail(subject, html) {
  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, subject, jobs: LIMIT }, null, 2));
    return;
  }
  if (!SENDGRID_API_KEY || !TO || !FROM) throw new Error('JOB_DIGEST requires SENDGRID_API_KEY, JOB_DIGEST_TO and JOB_DIGEST_FROM');
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: TO }] }],
      from: { email: FROM },
      subject,
      content: [{ type: 'text/html', value: html }]
    })
  });
  if (!response.ok) throw new Error(`SendGrid returned HTTP ${response.status}: ${await response.text()}`);
}

async function main() {
  await connectMongo();
  const profile = await CandidateProfile.findOne({ profileId: DEFAULT_PROFILE_ID }).lean();
  if (!profile) throw new Error(`Candidate profile '${DEFAULT_PROFILE_ID}' not found`);

  const since = new Date(Date.now() - HOURS * 60 * 60 * 1000);
  const jobs = await Job.find({
    'status.isLive': { $ne: false },
    'dates.lastSeenAt': { $gte: since }
  }).sort({ 'dates.lastSeenAt': -1 }).limit(500).lean();

  const companyIds = [...new Set(jobs.map(job => String(job.companyId || '')).filter(Boolean))];
  const companies = await Company.find({ companyId: { $in: companyIds } }).select('companyId companyName sponsorship').lean();
  const byCompany = new Map(companies.map(company => [String(company.companyId), company]));
  const sentRows = await JobDigestDelivery.find({ sentAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }).select('fingerprint').lean();
  const sent = new Set(sentRows.map(x => x.fingerprint));

  const matches = [];
  for (const job of jobs) {
    if (sent.has(job.fingerprint)) continue;
    const company = byCompany.get(String(job.companyId || ''));
    const payload = {
      ...job,
      companyName: company?.companyName || job.companyName || job.raw?.companyName || 'Company being resolved',
      sponsorship: company?.sponsorship || 'unknown',
      technicalSkills: job.raw?.technicalSkills || job.technicalSkills || [],
      criteria: job.raw?.criteria || job.criteria || { essential: [], desirable: [] },
      seniority: job.raw?.seniority || job.seniority || analyseJob({ title: job.title, description: job.description || '' }).seniority
    };
    const analysis = analyseJob({ title: payload.title, description: payload.description || '', location: payload.location, employmentType: payload.employmentType, source: payload.source?.url || '', ats: payload.source?.ats || '', postedAt: payload.dates?.postedAt, closingAt: payload.dates?.closingAt });
    const match = scoreCandidateAgainstJob({ cvSkills: profile.skills, yearsExperience: profile.yearsExperience, cvText: profile.cvText, job: { ...payload, ...analysis } });
    if (match.score >= MIN_SCORE) matches.push({ job: payload, match });
  }

  matches.sort((a, b) => b.match.score - a.match.score);
  const selected = matches.slice(0, LIMIT);

  if (!selected.length) {
    console.log(`No new jobs matched the profile in the last ${HOURS} hours.`);
    await mongoose.disconnect();
    return;
  }

  const rows = selected.map(({ job, match }) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #ddd">
        <div style="font-size:16px;font-weight:700">${escapeHtml(job.title)}</div>
        <div>${escapeHtml(job.companyName)} · ${escapeHtml(job.location || 'UK-wide')}</div>
        <div>Match: <strong>${match.score}%</strong> · Sponsorship: ${escapeHtml(job.sponsorship || 'unknown')}</div>
        <div style="margin-top:6px"><a href="${escapeHtml(job.source?.url || '#')}">Apply / view job</a></div>
      </td>
    </tr>`).join('');

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222"><h2>JobMatch — ${selected.length} new matching jobs</h2><p>Profile: ${escapeHtml(profile.name || DEFAULT_PROFILE_ID)} · Last ${HOURS} hours · minimum match ${MIN_SCORE}%</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="color:#666;font-size:12px">Sponsorship marked unknown has not been treated as a negative claim.</p></body></html>`;
  const subject = `JobMatch: ${selected.length} new UK roles matching your profile`;
  await sendEmail(subject, html);

  await JobDigestDelivery.bulkWrite(selected.map(({ job }) => ({ updateOne: { filter: { fingerprint: job.fingerprint }, update: { $set: { fingerprint: job.fingerprint, sentAt: new Date() } }, upsert: true } })), { ordered: false });
  console.log(JSON.stringify({ selected: selected.length, considered: jobs.length, minimumScore: MIN_SCORE, since: since.toISOString(), dryRun: DRY_RUN }, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('JOB DIGEST FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
