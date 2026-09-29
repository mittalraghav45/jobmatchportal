import { buildApplicationPack } from './applicationPack.js';

export function selectApplicationOutputs(result = {}, task = 'full') {
  const pack = buildApplicationPack(result);
  if (task === 'skills') return { keywords: pack.keywords, skills: pack.skills, validation: pack.validation };
  if (task === 'experience') return { experienceBullets: pack.experienceBullets, evidenceGaps: pack.evidenceGaps, validation: pack.validation };
  if (task === 'projects') return { projects: pack.projects, evidenceGaps: pack.evidenceGaps, validation: pack.validation };
  if (task === 'summary') return { summary: pack.summary, validation: pack.validation };
  if (task === 'coverLetter') return { summary: pack.summary, coverLetter: pack.coverLetter, validation: pack.validation };
  if (task === 'supportingStatement') return { supportingStatement: pack.supportingStatement, evidenceMatrix: pack.evidenceMatrix, evidenceGaps: pack.evidenceGaps, validation: pack.validation };
  if (task === 'coldEmail') return { coverLetter: pack.coverLetter, validation: pack.validation };
  return pack;
}
