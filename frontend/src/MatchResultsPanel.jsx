import React, { useCallback, useEffect, useState } from 'react'

const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const browserHost = typeof window !== 'undefined' ? window.location.hostname : ''
const isLocalBrowser = browserHost === 'localhost' || browserHost === '127.0.0.1' || browserHost === '::1'
const API_BASE_URL = configuredApiBase && (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBase) || isLocalBrowser) ? configuredApiBase : ''

function fitClass(fit) {
  if (fit === 'strong' || fit === 'strong_unconfirmed_sponsorship') return 'bg-green-900 text-green-300'
  if (fit === 'possible') return 'bg-yellow-900 text-yellow-300'
  return 'bg-zinc-800 text-zinc-400'
}

function sponsorshipClass(status) {
  if (status === 'confirmed') return 'bg-green-950 text-green-300 border-green-900'
  if (status === 'explicitly_unavailable') return 'bg-red-950 text-red-300 border-red-900'
  return 'bg-yellow-950 text-yellow-300 border-yellow-900'
}

function sponsorshipLabel(status) {
  if (status === 'confirmed') return 'Sponsorship confirmed'
  if (status === 'explicitly_unavailable') return 'Sponsorship unavailable'
  if (status === 'not_required') return 'Sponsorship not required'
  return 'Sponsorship unconfirmed'
}

async function readJson(response) {
  const text = await response.text()
  if (!text.trim()) throw new Error(`HTTP ${response.status} with empty response`)
  try { return JSON.parse(text) } catch { throw new Error(`HTTP ${response.status}: invalid JSON response`) }
}

export default function MatchResultsPanel() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fit, setFit] = useState('')
  const [minimumScore, setMinimumScore] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '50', minimumScore: String(minimumScore) })
      if (fit) params.set('applicationFit', fit)
      const response = await fetch(`${API_BASE_URL}/api/match-results?${params}`)
      const data = await readJson(response)
      if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`)
      const rows = Array.isArray(data.matches) ? data.matches : Array.isArray(data.results) ? data.results : []
      rows.sort((a, b) => Number(b.matchScore ?? b.candidateScore?.score ?? b.score ?? 0) - Number(a.matchScore ?? a.candidateScore?.score ?? a.score ?? 0))
      setMatches(rows)
    } catch (err) {
      setError(err.message || 'Unable to load match results')
      setMatches([])
    } finally {
      setLoading(false)
    }
  }, [fit, minimumScore])

  useEffect(() => { load() }, [load])

  return (
    <section className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fit for applying</h2>
          <p className="text-xs text-zinc-500">Verified, fresh jobs ranked by candidate fit and sponsorship certainty.</p>
        </div>
        <div className="flex gap-2">
          <select value={fit} onChange={e => setFit(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs">
            <option value="">All fits</option>
            <option value="strong">Strong — sponsorship confirmed</option>
            <option value="strong_unconfirmed_sponsorship">Strong — sponsorship unconfirmed</option>
            <option value="possible">Possible</option>
            <option value="weak">Weak</option>
          </select>
          <select value={minimumScore} onChange={e => setMinimumScore(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs">{[0,60,70,80,90].map(value => <option key={value} value={value}>{value}+ score</option>)}</select>
          <button onClick={load} className="bg-violet-600 hover:bg-violet-700 text-white rounded px-3 py-1.5 text-xs">Refresh</button>
        </div>
      </div>
      {loading && <div className="text-xs text-zinc-500 mt-4">Loading matched jobs...</div>}
      {error && <div className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded p-3 mt-4">{error}</div>}
      {!loading && !error && matches.length === 0 && <div className="text-xs text-zinc-500 mt-4 border border-dashed border-zinc-800 rounded p-4">No persisted matches for these filters.</div>}
      <div className="grid lg:grid-cols-2 gap-3 mt-4">
        {matches.map((item, index) => {
          const job = item.job || {}
          const score = Number(item.matchScore ?? item.candidateScore?.score ?? item.score ?? 0)
          const applicationFit = item.applicationFit || item.candidateScore?.applicationFit || 'weak'
          const matchStrength = item.matchStrength || (applicationFit === 'strong_unconfirmed_sponsorship' ? 'strong' : applicationFit)
          const sponsorshipStatus = item.components?.sponsorshipStatus || (applicationFit === 'strong' ? 'confirmed' : 'unconfirmed')
          const reasons = item.reasons || item.candidateScore?.reasons || []
          const isLive = job.status?.isLive !== false
          const freshness = job.quality?.freshness
          return (
            <article key={item._id || item.id || job._id || job.id || `${job.title}-${index}`} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{job.title || 'Untitled role'}</h3>
                  <div className="text-xs text-zinc-500 mt-1">{job.companyName || 'Unknown company'} • {job.location || 'UK'}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[10px] bg-green-950 text-green-300 border border-green-900 rounded-full px-2 py-0.5">{isLive ? '✓ Live' : 'Closed'}</span>
                    {freshness === 'fresh' && <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-900 rounded-full px-2 py-0.5">✓ Fresh</span>}
                    {job.verification?.status === 'live' && <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full px-2 py-0.5">✓ Verified</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold">{score}%</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${fitClass(applicationFit)}`}>{matchStrength === 'strong' ? 'Strong match' : applicationFit}</span>
                </div>
              </div>
              <div className={`inline-flex text-[10px] border rounded-full px-2 py-0.5 mt-3 ${sponsorshipClass(sponsorshipStatus)}`}>{sponsorshipLabel(sponsorshipStatus)}</div>
              {reasons.length > 0 && <div className="flex flex-wrap gap-1 mt-3">{reasons.filter(reason => !String(reason).startsWith('strong_')).slice(0, 5).map(reason => <span key={reason} className="text-[10px] bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5">{String(reason).replaceAll('_', ' ')}</span>)}</div>}
              {(job.applyUrl || job.url) && <a href={job.applyUrl || job.url} target="_blank" rel="noreferrer" className="inline-block mt-3 text-xs text-violet-400 hover:underline">Apply →</a>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
