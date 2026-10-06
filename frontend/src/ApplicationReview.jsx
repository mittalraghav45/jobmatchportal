import React,{useState}from'react';
const API=(import.meta.env.VITE_API_BASE_URL||'http://localhost:3001').replace(/\/$/,'');

export default function ApplicationReview({ application, busy, onClose, onGenerate, onStatus }) {
  const pack = application?.materials?.applicationPack || application?.applicationPack || null;
  const validation = pack?.validation;
  const status = application?.status || 'saved';
  const [followUpAt,setFollowUpAt]=useState(application?.followUpAt?new Date(application.followUpAt).toISOString().slice(0,16):'');
  const [followUpBusy,setFollowUpBusy]=useState(false);
  const [followUpMessage,setFollowUpMessage]=useState('');
  const [rejectionReason,setRejectionReason]=useState(application?.rejectionReason||'');
  const saveFollowUp=async()=>{setFollowUpBusy(true);setFollowUpMessage('');try{const response=await fetch(`${API}/api/applications/${application.applicationId}/follow-up`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({followUpAt:followUpAt?new Date(followUpAt).toISOString():null})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);application.followUpAt=data.followUpAt;setFollowUpMessage('Follow-up saved')}catch(error){setFollowUpMessage(error.message)}finally{setFollowUpBusy(false)}};
  const [ai,setAi]=useState(null);
  const [aiBusy,setAiBusy]=useState(false);
  const [aiError,setAiError]=useState('');

  const getAIInsight=async()=>{
    setAiBusy(true);setAiError('');
    try{
      const response=await fetch(`${API}/api/ai/job-insight`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:application?.job?.id,profileId:application?.profileId||'default'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||data.error||`HTTP ${response.status}`);
      setAi(data.insight||null);
    }catch(error){setAiError(error.message)}finally{setAiBusy(false)}
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="application-modal" onClick={event=>event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="review-head">
          <div>
            <small>{application.companyName || application.job?.companyName || application.job?.company || 'Company'}</small>
            <h2>{application.jobTitle || application.job?.title || 'Application review'}</h2>
          </div>
          <span className="sponsor">{status}</span>
        </div>

        <div className="review-actions">
          <div className="follow-up-controls">
            <label>Follow up <input type="datetime-local" value={followUpAt} onChange={e=>setFollowUpAt(e.target.value)} /></label>
            <button disabled={followUpBusy} onClick={saveFollowUp}>{followUpBusy?'Saving…':'Save follow-up'}</button>
            {followUpMessage&&<span className="muted">{followUpMessage}</span>}
          </div>
          <button className="primary" disabled={busy} onClick={onGenerate}>
            {busy ? 'Generating…' : pack ? 'Regenerate application pack' : 'Generate application pack'}
          </button>
          <button disabled={aiBusy} onClick={getAIInsight}>{aiBusy?'Thinking…':'✨ Ask JobMatch AI'}</button>
          <select value={status} disabled={busy} onChange={event=>onStatus(event.target.value)}>
            <option value="saved">Saved</option><option value="tailoring">Tailoring</option><option value="ready_to_apply">Ready to apply</option><option value="applied">Applied</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option>
          </select>
        </div>

        {status==='rejected'&&<div className="review-block">
          <h3>Rejection reason</h3>
          <textarea value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)} placeholder="Why was this application rejected?" />
          <small className="muted">Stored with the application when the rejection status is updated.</small>
        </div>}
        {Array.isArray(application.statusHistory)&&application.statusHistory.length>0&&<section className="review-block">
          <h3>Status history</h3>
          <div>{application.statusHistory.map((item,i)=><div key={i}>{item.status} · {new Date(item.at).toLocaleString()}</div>)}</div>
        </section>}
        {aiError&&<div className="validation invalid">AI insight unavailable: {aiError}</div>}
        {ai&&<AIInsight insight={ai}/>} 

        {!pack ? (
          <div className="empty-review"><h3>No application pack yet</h3><p>Generate the pack to create the tailored CV content, cover letter, supporting statement and evidence review.</p></div>
        ) : (
          <div className="pack">
            <ValidationBox validation={validation}/>
            <ReviewBlock title="Professional summary" value={pack.summary || pack.professionalSummary}/>
            <ReviewBlock title="Keywords" value={(pack.keywords || []).join(' · ')}/>
            <ReviewBlock title="Cover letter" value={pack.coverLetter}/>
            <ReviewBlock title="Supporting statement" value={pack.supportingStatement}/>
            <ReviewBlock title="Evidence gaps" value={(pack.evidenceGaps || []).map(item=>typeof item==='string'?item:JSON.stringify(item)).join('\n')}/>
            <ReviewBlock title="Experience bullets" value={(pack.experienceBullets || []).map(item=>typeof item==='string'?item:JSON.stringify(item)).join('\n')}/>
          </div>
        )}
      </div>
    </div>
  );
}

function AIInsight({insight}){return <section className="review-block ai-insight"><div className="review-head"><div><small>OPENAI</small><h3>{insight.headline||'AI job insight'}</h3></div><span className="sponsor">{insight.confidence||'medium'} confidence</span></div><ReviewBlock title="Why it matches" value={(insight.whyItMatches||[]).map(x=>`• ${x}`).join('\n')}/><ReviewBlock title="Skill gaps" value={(insight.skillGaps||[]).map(x=>`• ${x}`).join('\n')}/><ReviewBlock title="Sponsorship" value={insight.sponsorshipNote}/><ReviewBlock title="Seniority" value={insight.seniorityNote}/><ReviewBlock title="Application advice" value={insight.applicationAdvice}/></section>}
function ValidationBox({validation}){if(!validation)return null;return <div className={validation.valid?'validation valid':'validation invalid'}><strong>{validation.valid?'Validation passed':'Validation requires attention'}</strong>{(validation.errors||[]).map(error=><div key={error}>Error: {error}</div>)}{(validation.warnings||[]).map(warning=><div key={warning}>Warning: {warning}</div>)}</div>}
function ReviewBlock({title,value}){if(!value)return null;return <section className="review-block"><h3>{title}</h3><div>{value}</div></section>}
