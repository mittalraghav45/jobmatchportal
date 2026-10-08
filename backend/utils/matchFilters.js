import { ukJobMongoFilter } from './ukJobLocation.js';
import { techJobMongoFilter } from './techJobRole.js';

export function buildVerifiedLiveMatchFilter(sponsorshipCompanyIds = null) {
  const filter = {
    $and: [
      { 'status.isLive': true },
      { 'verification.status': 'live' },
      { applyUrl: { $type: 'string', $ne: '' } },
      { 'processing.status': 'complete' },
      ukJobMongoFilter(),
      techJobMongoFilter()
    ]
  };

  if (Array.isArray(sponsorshipCompanyIds)) {
    filter.companyId = { $in: sponsorshipCompanyIds };
  }

  return filter;
}

