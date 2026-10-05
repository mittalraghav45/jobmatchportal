import 'dotenv/config';
import mongoose from 'mongoose';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';

const version = 'v2';
const profileId = process.env.MATCH_PROFILE_ID || DEFAULT_PROFILE_ID;

const cvProfile = {
  name: 'Raghav Mittal',
  location: 'United Kingdom',
  yearsExperience: 2.5,
  summary: 'Full-Stack Software Engineer with 2+ years of experience building scalable web applications using React, TypeScript, JavaScript, Node.js, PHP, Next.js and AWS. Experienced in CI/CD, automated testing, REST APIs, cloud infrastructure and performance optimisation.',
  skills: [
    'React', 'TypeScript', 'JavaScript', 'Node.js', 'PHP', 'Core PHP', 'Yii2', 'Next.js',
    'Express', 'HTML5', 'CSS3', 'Redux', 'React Hooks', 'REST APIs', 'Jest', 'Playwright',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Elasticsearch', 'Kafka', 'RabbitMQ', 'AWS', 'GCP',
    'GitHub Actions', 'CI/CD', 'Linux', 'WCAG', 'SEO', 'Web Security', 'Agile', 'Scrum'
  ],
  targetRoles: [
    'Full-Stack Software Engineer',
    'Software Engineer',
    'Frontend Engineer',
    'Frontend Software Engineer',
    'Full-Stack Developer',
    'Web Developer'
  ],
  education: [
    { qualification: 'MSc Computer Science', institution: 'University of Southampton', result: 'Merit' },
    { qualification: 'B.Tech Computer Science', institution: 'Amity University Noida' }
  ],
  experience: [
    {
      employer: 'IndiaMART InterMESH Limited',
      title: 'Software Engineer',
      dates: 'Mar 2021 – Aug 2023',
      highlights: [
        'Built scalable full-stack web features using PHP, Yii2, JavaScript, React, Node.js and REST APIs.',
        'Designed a parallel tender-upload workflow with server-side duplicate detection.',
        'Improved AJAX-driven workflows and reduced page load and server response times.',
        'Built location and category filters for tender search.',
        'Migrated scheduled jobs and scripts to AWS and improved backend performance.',
        'Worked with PostgreSQL, MongoDB, Elasticsearch, Kafka and RabbitMQ.'
      ]
    }
  ],
  certifications: [
    { name: 'AWS Certified Cloud Practitioner' },
    { name: 'Certified Ethical Hacker (CEH v10)' }
  ],
  workAuthorisation: {
    requiresSkilledWorkerSponsorship: true,
    sponsorshipRequired: true
  },
  preferences: {
    requiresSponsorship: true,
    requiresSkilledWorkerSponsorship: true,
    excludeTechnologies: ['Java', '.NET', 'Python', 'React Native'],
    targetCountry: 'United Kingdom',
    targetRoles: [
      'Full-Stack Software Engineer',
      'Software Engineer',
      'Frontend Engineer',
      'Frontend Software Engineer',
      'Full-Stack Developer',
      'Web Developer'
    ]
  }
};

await mongoose.connect(process.env.MONGODB_URI);
try {
  const existing = await CandidateProfile.findOne({ profileId }).lean();
  const existingVersions = Array.isArray(existing?.versions) ? existing.versions : [];
  const versions = [...existingVersions];

  if (existing && !versions.some(item => item.version === 'v1')) {
    versions.push({
      version: 'v1',
      sourceResume: existing.metadata?.sourceResume || 'previous-candidate-profile',
      importedAt: existing.createdAt || new Date(),
      summary: existing.summary || '',
      skills: existing.skills || [],
      education: existing.education || [],
      experience: existing.experience || [],
      certifications: existing.certifications || [],
      metadata: existing.metadata || {}
    });
  }

  const versionRecord = {
    version,
    sourceResume: 'Raghav_CV(9).pdf',
    importedAt: new Date(),
    summary: cvProfile.summary,
    skills: cvProfile.skills,
    education: cvProfile.education,
    experience: cvProfile.experience,
    certifications: cvProfile.certifications,
    targetRoles: cvProfile.targetRoles,
    metadata: {
      source: 'uploaded_cv',
      canonical: true,
      importedBy: 'importCvProfileV2.js'
    }
  };

  const withoutCurrent = versions.filter(item => item.version !== version);
  withoutCurrent.push(versionRecord);

  await CandidateProfile.findOneAndUpdate(
    { profileId },
    {
      $set: {
        profileId,
        name: cvProfile.name,
        location: cvProfile.location,
        yearsExperience: cvProfile.yearsExperience,
        summary: cvProfile.summary,
        skills: cvProfile.skills,
        education: cvProfile.education,
        experience: cvProfile.experience,
        certifications: cvProfile.certifications,
        workAuthorisation: cvProfile.workAuthorisation,
        preferences: cvProfile.preferences,
        activeVersion: version,
        versions: withoutCurrent,
        metadata: {
          ...(existing?.metadata || {}),
          version,
          sourceResume: versionRecord.sourceResume,
          source: 'uploaded_cv'
        }
      }
    },
    { upsert: true, new: true }
  );

  console.log(JSON.stringify({ profileId, activeVersion: version, sourceResume: versionRecord.sourceResume }, null, 2));
} finally {
  await mongoose.disconnect();
}
