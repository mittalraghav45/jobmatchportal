import { loadCandidateProfile } from './profileMatching.js';
import { buildStructuredApplicationMessages } from './applicationEngine.js';
import { stripUnsupportedFields, validateApplicationOutput } from './applicationValidator.js';

export async function buildApplicationGenerationRequest({ profileId = 'default', job = {}, companyMaterial = {}, recipient, task = 'full' } = {}) {
  if (!job.title || !(job.companyName || job.company)) {
    throw new Error('job.title and job.companyName are required');
  }

  const profile = await loadCandidateProfile(profileId);
  const candidateEvidence = {
    name: profile.name || '',
    summary: profile.summary || '',
    skills: profile.skills || [],
    yearsExperience: Number(profile.yearsExperience || 0),
    education: profile.education || [],
    experience: profile.experience || [],
    certifications: profile.certifications || [],
    workAuthorisation: profile.workAuthorisation || {},
    preferences: profile.preferences || {},
    cvText: profile.cvText || ''
  };

  const { classification, keywords, messages } = buildStructuredApplicationMessages({
    companyName: job.companyName || job.company,
    role: job.title,
    jobDescription: job.description || '',
    candidateEvidence,
    companyMaterial,
    recipient,
    task
  });

  return { profileId, classification, extractedKeywords: keywords, messages, candidateEvidence };
}

export function validateGeneratedApplication(rawOutput, context = {}) {
  const cleaned = stripUnsupportedFields(rawOutput || {});
  const validation = validateApplicationOutput(cleaned, {
    publicSector: Boolean(context.publicSector),
    candidateEvidence: context.candidateEvidence || ''
  });
  return { result: cleaned, validation };
}
