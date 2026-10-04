const DEFAULT_RETRY_HOURS = 24;

export function shouldProcessSource(state = {}, { now = new Date(), retryAfterHours = DEFAULT_RETRY_HOURS } = {}) {
  if (!state?.lastAttemptedAt) return true;
  const attemptedAt = new Date(state.lastAttemptedAt);
  if (Number.isNaN(attemptedAt.getTime())) return true;
  const retryMs = Math.max(0, Number(retryAfterHours) || DEFAULT_RETRY_HOURS) * 60 * 60 * 1000;
  return new Date(now).getTime() - attemptedAt.getTime() >= retryMs;
}

export function buildSourceIngestionState({
  previous = {},
  now = new Date(),
  status,
  queries = 0,
  discovered = 0,
  added = 0,
  updated = 0,
  duplicatesRemoved = 0,
  rejected = 0,
  sourcePagesFetched = 0,
  sourcePageFailures = 0,
  error = null
} = {}) {
  const attemptedAt = new Date(now).toISOString();
  const next = {
    ...previous,
    status,
    lastAttemptedAt: attemptedAt,
    lastFinishedAt: attemptedAt,
    lastQueries: queries,
    lastDiscovered: discovered,
    lastAdded: added,
    lastUpdated: updated,
    lastDuplicatesRemoved: duplicatesRemoved,
    lastRejected: rejected,
    lastSourcePagesFetched: sourcePagesFetched,
    lastSourcePageFailures: sourcePageFailures,
    consecutiveFailures: status === 'failed' ? Number(previous.consecutiveFailures || 0) + 1 : 0
  };

  if (status === 'success') next.lastSuccessAt = attemptedAt;
  if (status === 'failed') next.lastFailureAt = attemptedAt;
  if (error) next.lastError = String(error).slice(0, 1000);
  else delete next.lastError;

  return next;
}

export function summariseSourceIngestion(summary = {}) {
  return {
    status: summary.failed ? 'failed' : 'success',
    queries: summary.queries || 0,
    discovered: summary.discovered || 0,
    added: summary.added || 0,
    updated: summary.updated || 0,
    duplicatesRemoved: summary.duplicatesRemoved || 0,
    rejected: summary.rejected || 0,
    sourcePagesFetched: summary.sourcePagesFetched || 0,
    sourcePageFailures: summary.sourcePageFailures || 0
  };
}
