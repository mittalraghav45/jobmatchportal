import mongoose from 'mongoose';

const JobMatchCacheSchema = new mongoose.Schema({
  profileId: { type: String, required: true },
  jobFingerprint: { type: String, required: true },
  jobUpdatedAt: { type: Date, default: null },
  profileUpdatedAt: { type: Date, default: null },
  score: { type: Number, required: true, index: true },
  match: { type: mongoose.Schema.Types.Mixed, required: true },
  calculatedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true, versionKey: false });

JobMatchCacheSchema.index({ profileId: 1, jobFingerprint: 1 }, { unique: true });
JobMatchCacheSchema.index({ profileId: 1, score: -1 });
JobMatchCacheSchema.index({ profileId: 1, calculatedAt: -1 });

export const JobMatchCache = mongoose.models.JobMatchCache || mongoose.model('JobMatchCache', JobMatchCacheSchema);
