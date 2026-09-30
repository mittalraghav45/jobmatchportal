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

export const DEFAULT_PROFILE_ID = 'default';

export function sanitiseCandidateProfile(input = {}) {
  const allowed = [
    'name', 'location', 'yearsExperience', 'summary', 'skills',
    'education', 'experience', 'certifications', 'workAuthorisation',
    'preferences', 'cvText', 'metadata'
  ];
  const output = {};
  for (const key of allowed) {
    if (input[key] !== undefined) output[key] = input[key];
  }
  if (output.yearsExperience !== undefined) {
    output.yearsExperience = Number(output.yearsExperience);
    if (!Number.isFinite(output.yearsExperience) || output.yearsExperience < 0) {
      throw new Error('yearsExperience must be a non-negative number');
    }
  }
  if (output.skills !== undefined) {
    if (!Array.isArray(output.skills)) throw new Error('skills must be an array');
    output.skills = [...new Set(output.skills.map(String).map(x => x.trim()).filter(Boolean))];
  }
  return output;
}
