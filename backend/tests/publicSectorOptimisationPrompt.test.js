import { describe, expect, test } from 'vitest';
import {
  classifyPublicSectorOrganisation,
  extractCriteria,
  buildEvidenceMatrix
} from '../prompts/publicSectorOptimisationPrompt.js';

describe('public sector classification', () => {
  test('detects NHS and DWP applications', () => {
    const result = classifyPublicSectorOrganisation('Software Developer - NHS Trust / DWP');
    expect(result.isPublicSector).toBe(true);
    expect(result.matchedTypes).toContain('NHS');
    expect(result.matchedTypes).toContain('DWP');
  });

  test('does not classify an ordinary private employer', () => {
    expect(classifyPublicSectorOrganisation('Software Engineer - Acme Ltd').isPublicSector).toBe(false);
  });
});

describe('criteria extraction', () => {
  test('separates essential and desirable criteria', () => {
    const result = extractCriteria(`
      Essential criteria
      Experience with JavaScript
      Experience working with stakeholders
      Desirable criteria
      Experience in higher education
    `);

    expect(result.essential).toHaveLength(2);
    expect(result.desirable).toHaveLength(1);
    expect(result.essential[0]).toContain('JavaScript');
  });
});

describe('evidence matrix', () => {
  test('flags criteria with candidate evidence without inventing evidence', () => {
    const result = buildEvidenceMatrix(
      ['Experience with React', 'Experience with Python'],
      'I have professional experience building React applications.'
    );

    expect(result[0].supported).toBe(true);
    expect(result[1].supported).toBe(false);
  });
});
