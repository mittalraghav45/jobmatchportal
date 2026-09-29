// Backwards-compatible sponsorship API.
// Canonical implementation lives in sponsorRegistry.js.

export {
  normaliseSponsorRecord as normaliseSponsorshipRecord,
  evaluateSponsorship,
  canRecommendForSponsorship,
  mergeSponsorEvidence,
  SPONSOR_STATUSES as SPONSORSHIP_STATUSES,
  SPONSOR_SOURCES as SPONSORSHIP_SOURCES
} from './sponsorRegistry.js';

import { evaluateSponsorship } from './sponsorRegistry.js';

export function sponsorshipDecision(record = {}) {
  const result = evaluateSponsorship(record);
  return {
    status: result.decision,
    shouldBlock: result.decision === 'not-sponsor',
    reason: result.reason,
    sponsorship: result.sponsor
  };
}
