import React, { useCallback, useEffect, useState } from 'react'

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function fitClass(fit) {
  if (fit === 'strong') return 'bg-green-900 text-green-300'
  if (fit === 'possible') return 'bg-yellow-900 text-yellow-300'
  return 'bg-zinc-800 text-zinc-400'
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
      const params = new URLSearchParams({ limit: '20', minimumScore: String(minimumScore) })
      if (fit) params.set('applicationFit', fit)
      const response = await fetch(`${API_BASE_URL}/api/match-results?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
      setMatches(data.matches || data.results || [])
    } catch (err) {
      setError(err.message)
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
          <p className="text-xs text-zinc-500">Persisted candidate matches, ranked by your profile.</p>
        </div>
        <div className="flex gap-2">
          <select value={fit} onChange={e => setFit(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs">
            <option value="">All fits</option><option value="strong">Strong</option><option value="possible">Possible</option><option value="weak">Weak</option>
          </select>
          <select value={minimumScore} onChange={e => setMinimumScore(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs">
            {[0,60,70,80,90].map(value => <option key={value} value={value}>{value}+ score</option>)}
          </select>
          <button onClick={load} className="bg-violet-600 hover:bg-violet-700 text-white rounded px-3 py-1.5 text-xs">Refresh</button>
        </div>
      </div>

      {loading && <div className="text-xs text-zinc-500 mt-4">Loading matched jobs...</div>}
      {error && <div className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded p-3 mt-4">{error}</div>}
      {!loading && !error && matches.length === 0 && <div className="text-xs text-zinc-500 mt-4 border border-dashed border-zinc-800 rounded p-4">No persisted matches yet. Run the match persistence batch first.</div>}

      <div className="grid lg:grid-cols-2 gap-3 mt-4">
        {matches.map((item, index) => {
          const job = item.job || {}
          const score = Number(item.matchScore ?? item.candidateScore?.score ?? item.score ?? 0)
          const applicationFit = item.applicationFit || item.candidateScore?.applicationFit || 'weak'
          const reasons = item.reasons || item.candidateScore?.reasons || []
          return (
            <article key={item.id || job.id || `${job.title}-${index}`} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{job.title || 'Untitled role'}</h3>
                  <div className="text-xs text-zinc-500 mt-1">{job.companyName || 'Unknown company'} • {job.location || 'UK'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold">{score}%</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${fitClass(applicationFit)}`}>{applicationFit}</span>
                </div>
              </div>
              {reasons.length > 0 && <div className="flex flex-wrap gap-1 mt-3">{reasons.slice(0, 5).map(reason => <span key={reason} className="text-[10px] bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5">{String(reason).replaceAll('_', ' ')}</span>)}</div>}
              {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="inline-block mt-3 text-xs text-violet-400 hover:underline">Apply →</a>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
