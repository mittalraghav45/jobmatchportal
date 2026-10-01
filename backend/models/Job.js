import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true, index: true },
  schemaVersion: { type: String, required: true },
  externalId: { type: String, default: '', index: true },
  companyId: { type: String, required: true, index: true },
  title: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  location: { type: String, default: '', index: true },
  nation: { type: String, enum: ['England', 'Scotland', 'Wales', 'Northern Ireland', 'UK-wide'], default: 'UK-wide', index: true },
  employerType: { type: String, enum: ['private', 'nhs', 'councils', 'universities', 'dwp'], default: 'private', index: true },
  classificationVersion: { type: String, default: 'v1' },
  employmentType: { type: String, default: '' },
  department: { type: String, default: '' },
  source: {
    ats: { type: String, default: 'unknown', index: true },
    url: { type: String, default: '' }
  },
  dates: {
    postedAt: { type: Date, default: null },
    closingAt: { type: Date, default: null },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now }
  },
  status: {
    isLive: { type: Boolean, default: true, index: true }
  },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false });

JobSchema.index({ companyId: 1, 'status.isLive': 1 });
JobSchema.index({ 'source.ats': 1, externalId: 1 });
JobSchema.index({ nation: 1, employerType: 1, 'status.isLive': 1 });
JobSchema.index({ nation: 1, 'dates.lastSeenAt': -1 });

export const Job = mongoose.models.Job || mongoose.model('Job', JobSchema);
