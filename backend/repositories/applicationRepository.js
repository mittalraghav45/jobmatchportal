import { Application } from '../models/Application.js';

export async function upsertApplication(input = {}) {
  if (!input.jobId || !input.companyId) throw new Error('jobId and companyId are required.');
  const existing = await Application.findOne({ jobId: input.jobId, companyId: input.companyId }).lean();
  const nextStatus = input.status || existing?.status || 'saved';
  const historyEntry = existing && existing.status === nextStatus ? null : { status: nextStatus, at: new Date(), note: input.notes || '' };
  const update = {
    $set: {
      jobId: input.jobId,
      companyId: input.companyId,
      jobTitle: input.jobTitle || existing?.jobTitle || '',
      jobUrl: input.jobUrl || existing?.jobUrl || '',
      status: nextStatus,
      appliedAt: input.appliedAt ? new Date(input.appliedAt) : existing?.appliedAt || null,
      nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : existing?.nextActionAt || null,
      notes: input.notes ?? existing?.notes ?? '',
      cvVersion: input.cvVersion ?? existing?.cvVersion ?? '',
      coverLetterVersion: input.coverLetterVersion ?? existing?.coverLetterVersion ?? '',
      source: input.source ?? existing?.source ?? ''
    }
  };
  if (historyEntry) update.$push = { history: historyEntry };
  return Application.findOneAndUpdate({ jobId: input.jobId, companyId: input.companyId }, update, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
}

export async function listApplications({ status, limit = 100 } = {}) {
  const query = status ? { status } : {};
  return Application.find(query).sort({ updatedAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
}

export async function deleteApplication(jobId, companyId) {
  return Application.deleteOne({ jobId, companyId });
}
