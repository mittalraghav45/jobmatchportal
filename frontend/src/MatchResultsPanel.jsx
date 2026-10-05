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
  const [applications, setApplications] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyJob, setBusyJob] = useState('')
  const [fit, setFit] = useState('')
  const [minimumScore, setMinimumScore] = useState(0)
  const [employerType, setEmployerType] = useState('')
  const [nation, setNation] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '50', minimumScore: String(minimumScore) })
      if (fit) params.set('applicationFit', fit)
      if (employerType) params.set('employerType', employerType)
      if (nation) params.set('nation', nation)
      const response = await fetch(`${API_BASE_URL}/api/match-results?${params}`)
      const data = await readJson(response)
      if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`)
      const rows = Array.isArray(data.matches) ? data.matches : Array.isArray(data.results) ? data.results : []
      rows.sort((a, b) => Number(b.matchScore ?? b.candidateScore?.score ?? b.score ?? 0) - Number(a.matchScore ?? a.candidateScore?.score ?? a.score ?? 0))
      setMatches(rows)
      const profileId = rows.find(row => row.profileId)?.profileId
      if (profileId) {
        const appResponse = await fetch(`${API_BASE_URL}/api/applications?profileId=${encodeURIComponent(profileId)}`)
        const appData = await readJson(appResponse)
        if (appResponse.ok) {
          const mapped = {}
          for (const application of appData.applications || []) if (application.job?.id) mapped[String(application.job.id)] = application
          setApplications(mapped)
        }
      }
    } catch (err) {
      setError(err.message || 'Unable to load match results')
      setMatches([])
    } finally { setLoading(false) }
  }, [fit, minimumScore, employerType, nation])

  useEffect(() => { load() }, [load])

  const createApplication = async (item) => {
    const job = item.job || {}
    const jobId = String(job._id || job.id || item.jobId || '')
    if (!jobId) return
    setBusyJob(jobId)
    setActionError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: item.profileId || null,
          job: { id: jobId, title: job.title, company: job.companyName, companyId: job.companyId, url: job.applyUrl || job.url },
          match: { score: item.matchScore, applicationFit: item.applicationFit, matchStrength: item.matchStrength, components: item.components, reasons: item.reasons }
        })
      })
      const data = await readJson(response)
      if (!response.ok && response.status !== 409) throw new Error(data.error || `Request failed (${response.status})`)
      const application = data.application || applications[jobId]
      if (application) setApplications(prev => ({ ...prev, [jobId]: application }))
      else await load()
    } catch (err) { setActionError(err.message || 'Unable to create application') }
    finally { setBusyJob('') }
  }

  const updateApplicationStatus = async (jobId, applicationId, status) => {
    setBusyJob(jobId)
    setActionError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/applications/${encodeURIComponent(applicationId)}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
      })
      const data = await readJson(response)
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
      setApplications(prev => ({ ...prev, [jobId]: data.application }))
    } catch (err) { setActionError(err.message || 'Unable to update application') }
    finally { setBusyJob('') }
  }

  return (
    <section className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Fit for applying</h2><p className="text-xs text-zinc-500">Verified, fresh jobs ranked by candidate fit and sponsorship certainty.</p></div>
        <div className="flex gap-2">
          <select value={fit} onChange={e => setFit(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs"><option value="">All fits</option><option value="strong">Strong — sponsorship confirmed</option><option value="strong_unconfirmed_sponsorship">Strong — sponsorship unconfirmed</option><option value="possible">Possible</option><option value="weak">Weak</option></select>
          <select value={minimumScore} onChange={e => setMinimumScore(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs">{[0,60,70,80,90].map(value => <option key={value} value={value}>{value}+ score</option>)}</select>
          <select value={employerType} onChange={e => setEmployerType(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs" aria-label="Employer sector"><option value="">All UK employers</option><option value="private">Private</option><option value="councils">Councils</option><option value="universities">Universities</option><option value="nhs">NHS</option><option value="dwp">DWP</option></select>
          <select value={nation} onChange={e => setNation(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs" aria-label="UK nation"><option value="">All UK</option><option value="England">England</option><option value="Scotland">Scotland</option><option value="Wales">Wales</option><option value="Northern Ireland">Northern Ireland</option><option value="UK-wide">UK-wide</option></select>
          <button onClick={load} className="bg-violet-600 hover:bg-violet-700 text-white rounded px-3 py-1.5 text-xs">Refresh</button>
        </div>
      </div>
      {loading && <div className="text-xs text-zinc-500 mt-4">Loading matched jobs...</div>}
      {error && <div className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded p-3 mt-4">{error}</div>}
      {actionError && <div className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded p-3 mt-4">{actionError}</div>}
      {!loading && !error && matches.length === 0 && <div className="text-xs text-zinc-500 mt-4 border border-dashed border-zinc-800 rounded p-4">No persisted matches for these filters.</div>}
      <div className="grid lg:grid-cols-2 gap-3 mt-4">
        {matches.map((item, index) => {
          const job = item.job || {}
          const jobId = String(job._id || job.id || item.jobId || '')
          const application = applications[jobId]
          const score = Number(item.matchScore ?? item.candidateScore?.score ?? item.score ?? 0)
          const applicationFit = item.applicationFit || item.candidateScore?.applicationFit || 'weak'
          const matchStrength = item.matchStrength || (applicationFit === 'strong_unconfirmed_sponsorship' ? 'strong' : applicationFit)
          const sponsorshipStatus = item.components?.sponsorshipStatus || (applicationFit === 'strong' ? 'confirmed' : 'unconfirmed')
          const reasons = item.reasons || item.candidateScore?.reasons || []
          const isLive = job.status?.isLive !== false
          const freshness = job.quality?.freshness
          return (
            <article key={item._id || item.id || job._id || job.id || `${job.title}-${index}`} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-semibold">{job.title || 'Untitled role'}</h3><div className="text-xs text-zinc-500 mt-1">{job.companyName || 'Unknown company'} • {job.location || 'UK'}</div><div className="flex flex-wrap gap-1 mt-2"><span className="text-[10px] bg-green-950 text-green-300 border border-green-900 rounded-full px-2 py-0.5">{isLive ? '✓ Live' : 'Closed'}</span>{freshness === 'fresh' && <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-900 rounded-full px-2 py-0.5">✓ Fresh</span>}{job.verification?.status === 'live' && <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full px-2 py-0.5">✓ Verified</span>}</div></div><div className="text-right shrink-0"><div className="text-xl font-bold">{score}%</div><span className={`text-[10px] px-2 py-0.5 rounded-full ${fitClass(applicationFit)}`}>{matchStrength === 'strong' ? 'Strong match' : applicationFit}</span></div></div>
              <div className={`inline-flex text-[10px] border rounded-full px-2 py-0.5 mt-3 ${sponsorshipClass(sponsorshipStatus)}`}>{sponsorshipLabel(sponsorshipStatus)}</div>
              {reasons.length > 0 && <div className="flex flex-wrap gap-1 mt-3">{reasons.filter(reason => !String(reason).startsWith('strong_')).slice(0, 5).map(reason => <span key={reason} className="text-[10px] bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5">{String(reason).replaceAll('_', ' ')}</span>)}</div>}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {(job.applyUrl || job.url) && <a href={job.applyUrl || job.url} target="_blank" rel="noreferrer" className="text-xs text-violet-400 hover:underline">Apply →</a>}
                {!application && <button disabled={busyJob === jobId} onClick={() => createApplication(item)} className="text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded px-3 py-1.5">{busyJob === jobId ? 'Saving…' : 'Mark as applied'}</button>}
                {application && <><span className="text-[10px] bg-green-950 text-green-300 border border-green-900 rounded-full px-2 py-1">Tracked: {application.status}</span><select disabled={busyJob === jobId} value={application.status} onChange={e => updateApplicationStatus(jobId, application.applicationId, e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs"><option value="saved">Saved</option><option value="tailoring">Tailoring</option><option value="ready_to_apply">Ready to apply</option><option value="applied">Applied</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select></>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
