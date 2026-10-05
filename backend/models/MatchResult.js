import mongoose from 'mongoose';

const MatchResultSchema = new mongoose.Schema({
  profileId: { type: String, required: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  matchScore: { type: Number, required: true, min: 0, max: 100, index: true },
  applicationFit: { type: String, enum: ['strong', 'possible', 'weak', 'strong_unconfirmed_sponsorship'], required: true, index: true },
  reasons: { type: [String], default: [] },
  components: { type: mongoose.Schema.Types.Mixed, default: {} },
  eligibility: {
    uk: { type: Boolean, default: false, index: true },
    live: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    technology: { type: Boolean, default: false },
    calculatedAt: { type: Date, default: Date.now }
  },
  calculatedAt: { type: Date, default: Date.now, index: true },
  profileVersion: { type: String, default: 'v1' },
  matcherVersion: { type: String, default: 'v1' }
}, { timestamps: true, versionKey: false });

MatchResultSchema.index({ profileId: 1, jobId: 1 }, { unique: true });
MatchResultSchema.index({ profileId: 1, applicationFit: 1, matchScore: -1 });
MatchResultSchema.index({ profileId: 1, matchScore: -1, calculatedAt: -1 });
MatchResultSchema.index({ profileId: 1, 'eligibility.uk': 1, 'eligibility.live': 1, 'eligibility.verified': 1 });

export const MatchResult = mongoose.models.MatchResult || mongoose.model('MatchResult', MatchResultSchema);
