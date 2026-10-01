import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

async function get(path){
  const response=await fetch(`${BASE_URL}${path}`);
  const text=await response.text();
  let body={};
  try{body=JSON.parse(text);}catch{body={raw:text};}
  return {response,body};
}

let available=true;
try{const {response}=await get('/api/health');if(!response.ok)available=false;}catch{available=false;}

if(!available){
  test('job search filter tests skipped when backend is not running',{skip:`Backend unavailable at ${BASE_URL}`},()=>{});
}else{
  test('private employer filter is accepted',async()=>{
    const {response,body}=await get('/api/jobs?limit=5&employerType=private');
    assert.equal(response.status,200);
    assert.ok(Array.isArray(body.jobs));
    for(const job of body.jobs)assert.equal(String(job.employerType).toLowerCase(),'private');
  });

  test('multiple nation filters are accepted',async()=>{
    const {response,body}=await get('/api/jobs?limit=5&nation=England,Scotland');
    assert.equal(response.status,200);
    assert.ok(Array.isArray(body.jobs));
    for(const job of body.jobs)assert.ok(['England','Scotland'].includes(job.nation),`Unexpected nation: ${job.nation}`);
  });

  test('text search is server-side and paginated',async()=>{
    const {response,body}=await get('/api/jobs?limit=3&page=1&q=developer');
    assert.equal(response.status,200);
    assert.ok(Array.isArray(body.jobs));
    assert.equal(body.pagination.limit,3);
    assert.equal(body.pagination.page,1);
  });

  test('invalid work mode is rejected',async()=>{
    const {response}=await get('/api/jobs?workMode=spaceship');
    assert.equal(response.status,400);
  });

  test('invalid employment type is rejected',async()=>{
    const {response}=await get('/api/jobs?employmentType=spaceship');
    assert.equal(response.status,400);
  });

  test('sorting and live filter are accepted together',async()=>{
    const {response,body}=await get('/api/jobs?limit=5&sort=posted&live=true');
    assert.equal(response.status,200);
    assert.ok(Array.isArray(body.jobs));
    for(const job of body.jobs)assert.equal(job.status?.isLive,true);
  });
}

after(()=>{});
