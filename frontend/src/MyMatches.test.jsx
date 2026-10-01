import { describe, expect, it } from 'vitest';

function normaliseMatches(payload) {
  const candidates = payload?.jobs || payload?.matches || payload?.data || payload?.results || [];
  return Array.isArray(candidates) ? candidates : [];
}

describe('My Matches data contract', () => {
  it('accepts the jobs response returned by the matching API', () => {
    const result = normaliseMatches({ jobs: [{ _id: '1', title: 'Frontend Engineer' }] });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Frontend Engineer');
  });

  it('accepts a matches-shaped response without changing the API contract', () => {
    const result = normaliseMatches({ matches: [{ job: { title: 'Software Engineer' } }] });
    expect(result).toHaveLength(1);
    expect(result[0].job.title).toBe('Software Engineer');
  });

  it('returns an empty list for an invalid collection', () => {
    expect(normaliseMatches({ jobs: null })).toEqual([]);
  });
});
