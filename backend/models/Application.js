import mongoose from 'mongoose';

const ApplicationSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  companyId: { type: String, required: true, index: true },
  jobTitle: { type: String, default: '' },
  jobUrl: { type: String, default: '' },
  status: {
    type: String,
    enum: ['saved', 'applied', 'screening', 'technical', 'final', 'offer', 'rejected', 'withdrawn'],
    default: 'saved',
    index: true
  },
  appliedAt: { type: Date, default: null },
  nextActionAt: { type: Date, default: null, index: true },
  notes: { type: String, default: '' },
  cvVersion: { type: String, default: '' },
  coverLetterVersion: { type: String, default: '' },
  source: { type: String, default: '' },
  history: [{
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' }
  }]
}, { timestamps: true, versionKey: false });

ApplicationSchema.index({ jobId: 1, companyId: 1 }, { unique: true });
ApplicationSchema.index({ status: 1, nextActionAt: 1 });

export const Application = mongoose.models.Application || mongoose.model('Application', ApplicationSchema);
