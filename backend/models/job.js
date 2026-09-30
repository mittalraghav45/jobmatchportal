import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true, index: true },
  schemaVersion: { type: String, default: '1.0' },
  externalId: { type: String, default: '' },
  companyId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  location: { type: String, default: '' },
  employmentType: { type: String, default: '' },
  department: { type: String, default: '' },
  source: {
    ats: { type: String, default: 'unknown', index: true },
    url: { type: String, default: '' }
  },
  dates: {
    postedAt: { type: Date, default: null },
    closingAt: { type: Date, default: null },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true }
  },
  status: {
    isLive: { type: Boolean, default: true, index: true }
  },
  raw: { type: mongoose.Schema.Types.Mixed, default: null }
}, {
  timestamps: true,
  versionKey: false
});

jobSchema.index({ companyId: 1, 'status.isLive': 1 });
jobSchema.index({ 'dates.lastSeenAt': 1 });
jobSchema.index({ title: 'text', description: 'text' });

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);
