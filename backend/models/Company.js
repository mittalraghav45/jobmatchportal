import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema({
  companyId: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, required: true, index: true },
  companyNumber: { type: String, default: '' },
  website: { type: String, default: '' },
  careersUrl: { type: String, default: '' },
  enabled: { type: Boolean, default: true, index: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
  ats: { type: String, default: 'unknown', index: true },
  sponsorship: { type: String, enum: ['verified', 'not-sponsor', 'unknown'], default: 'unknown', index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false });

export const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);
