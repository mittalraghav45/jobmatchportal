import mongoose from 'mongoose';

const CandidateProfileSchema = new mongoose.Schema({
  profileId: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: '' },
  location: { type: String, default: '' },
  yearsExperience: { type: Number, default: 0, min: 0 },
  summary: { type: String, default: '' },
  skills: { type: [String], default: [] },
  education: { type: [mongoose.Schema.Types.Mixed], default: [] },
  experience: { type: [mongoose.Schema.Types.Mixed], default: [] },
  certifications: { type: [mongoose.Schema.Types.Mixed], default: [] },
  workAuthorisation: { type: mongoose.Schema.Types.Mixed, default: {} },
  preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  cvText: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false });

export const CandidateProfile = mongoose.models.CandidateProfile || mongoose.model('CandidateProfile', CandidateProfileSchema);
