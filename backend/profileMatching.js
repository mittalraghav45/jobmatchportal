import { CandidateProfile, DEFAULT_PROFILE_ID } from './models/CandidateProfile.js';
import { connectMongo } from './db/mongoose.js';
import { analyseJob, scoreCandidateAgainstJob } from './jobIntelligence.js';

/**
 * Load the candidate profile that should be treated as the source of truth.
 * This deliberately fails when MongoDB is unavailable rather than silently
 * falling back to demo candidate data.
 */
export async function loadCandidateProfile(profileId = DEFAULT_PROFILE_ID) {
  await connectMongo();
  const id = String(profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
  const profile = await CandidateProfile.findOne({ profileId: id }).lean();
  if (!profile) {
    const error = new Error(`Candidate profile '${id}' not found`);
    error.code = 'PROFILE_NOT_FOUND';
    throw error;
  }
  return profile;
}

/**
 * Score a job against the persisted candidate profile.
 * No candidate facts are invented here: skills, CV text and experience all
 * come directly from MongoDB.
 */
export async function matchJobToProfile({ profileId = DEFAULT_PROFILE_ID, job }) {
  if (!job || typeof job !== 'object') throw new Error('job is required');

  const profile = await loadCandidateProfile(profileId);
  const analysis = analyseJob({
    title: job.title || job.jobTitle || '',
    description: job.description || '',
    location: job.location,
    employmentType: job.employmentType || job.employment_type,
    source: job.source,
    ats: job.ats,
    postedAt: job.postedAt || job.posted_date,
    closingAt: job.closingAt || job.closing_date
  });

  const candidateScore = scoreCandidateAgainstJob({
    cvSkills: Array.isArray(profile.skills) ? profile.skills : [],
    cvText: profile.cvText || '',
    yearsExperience: Number(profile.yearsExperience || 0),
    job: analysis
  });

  return {
    profileId: profile.profileId,
    job: {
      title: job.title || job.jobTitle || '',
      companyName: job.companyName || job.company?.name || '',
      location: job.location || ''
    },
    analysis,
    candidateScore,
    profileSnapshot: {
      name: profile.name || '',
      skills: profile.skills || [],
      yearsExperience: Number(profile.yearsExperience || 0)
    }
  };
}
