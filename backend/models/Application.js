import mongoose from 'mongoose';

const ApplicationSchema = new mongoose.Schema({
  applicationId: { type: String, required: true, unique: true, index: true },
  job: {
    id: { type: String, default: null, index: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    companyId: { type: String, default: null, index: true },
    url: { type: String, default: null }
  },
  profileId: { type: String, default: null, index: true },
  match: { type: mongoose.Schema.Types.Mixed, default: {} },
  specialist: { type: String, default: 'all-in-one' },
  status: {
    type: String,
    enum: ['saved','tailoring','ready_to_apply','applied','interview','offer','rejected','withdrawn'],
    default: 'saved',
    index: true
  },
  materials: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes: { type: String, default: '' },
  recruiter: {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    url: { type: String, default: '' }
  },
  source: { type: String, default: '' },
  followUpAt: { type: Date, default: null, index: true },
  rejectionReason: { type: String, default: '' },
  statusHistory: {
    type: [{
      status: { type: String, required: true },
      at: { type: Date, required: true }
    }],
    default: []
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  appliedAt: { type: Date, default: null }
}, { versionKey: false });

ApplicationSchema.index({ profileId: 1, status: 1 });
ApplicationSchema.index({ 'job.id': 1, profileId: 1 });
ApplicationSchema.index({ profileId: 1, followUpAt: 1, status: 1 });

export const Application = mongoose.models.Application || mongoose.model('Application', ApplicationSchema);
