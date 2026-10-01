import React from 'react';
const NATIONS=['England','Scotland','Wales','Northern Ireland'];
const EMPLOYER_TYPES=[['private','Private'],['councils','Councils'],['universities','Universities'],['dwp','DWP'],['nhs','NHS']];
const WORK_MODES=[['all','Any work mode'],['remote','Remote'],['hybrid','Hybrid'],['onsite','On-site']];
export default function JobSearchPanel({q,setQ,nations,setNations,employerTypes,setEmployerTypes,sponsorship,setSponsorship,workMode,setWorkMode,employmentType,setEmploymentType,sort,setSort,onClear,jobTotal,page,limit,onPageChange,loading}){
 const toggle=(value,setter)=>setter(xs=>xs.includes(value)?xs.filter(x=>x!==value):[...xs,value]);
 const active=nations.length+employerTypes.length+(sponsorship!=='all'?1:0)+(workMode!=='all'?1:0)+(employmentType?1:0);
 const pages=Math.max(1,Math.ceil(jobTotal/limit));
 return <>
  <div className="job-filter-panel enhanced-filter-panel">
   <div className="filter-group"><div className="filter-heading"><strong>UK nation</strong><span>{nations.length?`${nations.length} selected`:'All UK'}</span></div>
    <label className="filter-check"><input type="checkbox" checked={!nations.length} onChange={()=>setNations([])}/><span>All UK nations</span></label>
    {NATIONS.map(n=><label className="filter-check" key={n}><input type="checkbox" checked={nations.includes(n)} onChange={()=>toggle(n,setNations)}/><span>{n}</span></label>)}
   </div>
   <div className="filter-group"><div className="filter-heading"><strong>Employer</strong><span>{employerTypes.length?`${employerTypes.length} selected`:'All employers'}</span></div>
    <label className="filter-check"><input type="checkbox" checked={!employerTypes.length} onChange={()=>setEmployerTypes([])}/><span>All employers</span></label>
    {EMPLOYER_TYPES.map(([value,label])=><label className="filter-check" key={value}><input type="checkbox" checked={employerTypes.includes(value)} onChange={()=>toggle(value,setEmployerTypes)}/><span>{label}</span></label>)}
   </div>
   <div className="filter-group"><div className="filter-heading"><strong>Sponsorship</strong><span>{sponsorship==='verified'?'Verified only':'All statuses'}</span></div>
    <label className="filter-check"><input type="radio" name="sponsor-filter" checked={sponsorship==='all'} onChange={()=>setSponsorship('all')}/><span>All statuses</span></label>
    <label className="filter-check"><input type="radio" name="sponsor-filter" checked={sponsorship==='verified'} onChange={()=>setSponsorship('verified')}/><span>Verified sponsors</span></label>
    <label className="filter-check"><input type="radio" name="sponsor-filter" checked={sponsorship==='unknown'} onChange={()=>setSponsorship('unknown')}/><span>Unknown sponsorship</span></label>
   </div>
   <div className="filter-group"><div className="filter-heading"><strong>Work mode</strong><span>{WORK_MODES.find(x=>x[0]===workMode)?.[1]}</span></div>
    {WORK_MODES.map(([value,label])=><label className="filter-check" key={value}><input type="radio" name="work-mode" checked={workMode===value} onChange={()=>setWorkMode(value)}/><span>{label}</span></label>)}
   </div>
   <div className="filter-search enhanced-filter-search">
    <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search title, company, skills or location"/>
    <select value={employmentType} onChange={e=>setEmploymentType(e.target.value)}><option value="">All employment types</option><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="permanent">Permanent</option></select>
    <select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Most recently seen</option><option value="posted">Newest posted</option><option value="oldest">Oldest seen</option></select>
    <button className="secondary" onClick={onClear}>Clear</button>
   </div>
  </div>
  {active>0&&<div className="active-filters"><span>{active} active filter{active===1?'':'s'}:</span>{nations.map(n=><button key={n} onClick={()=>toggle(n,setNations)}>{n} ×</button>)}{employerTypes.map(x=><button key={x} onClick={()=>toggle(x,setEmployerTypes)}>{EMPLOYER_TYPES.find(y=>y[0]===x)?.[1]} ×</button>)}{sponsorship!=='all'&&<button onClick={()=>setSponsorship('all')}>{sponsorship==='verified'?'Verified sponsorship':'Unknown sponsorship'} ×</button>}{workMode!=='all'&&<button onClick={()=>setWorkMode('all')}>{WORK_MODES.find(x=>x[0]===workMode)?.[1]} ×</button>}{employmentType&&<button onClick={()=>setEmploymentType('')}>{employmentType} ×</button>}<button className="clear-filter" onClick={onClear}>Clear all</button></div>}
  <div className="job-results-toolbar"><span>{jobTotal.toLocaleString()} matching jobs</span><span>{loading?'Refreshing…':`Page ${page} of ${pages}`}</span><div><button disabled={page<=1||loading} onClick={()=>onPageChange(page-1)}>Previous</button><button disabled={page>=pages||loading} onClick={()=>onPageChange(page+1)}>Next</button></div></div>
 </>;
}
