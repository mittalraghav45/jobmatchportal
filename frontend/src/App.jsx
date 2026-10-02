import React, { useState, useEffect, useMemo } from 'react';

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalBrowser = browserHost === 'localhost' || browserHost === '127.0.0.1' || browserHost === '::1';
// Prefer same-origin /api in hosted environments (including Codespaces). A
// localhost API override is only used when the browser itself is local.
const API_BASE_URL = configuredApiBaseUrl && (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBaseUrl) || isLocalBrowser)
  ? configuredApiBaseUrl
  : '';

// Keep these lists small and editable. Classification is based on the supplied
// company data; it is not a sponsorship or eligibility determination.
const FILTERS = {
  public: ['nhs','council','government','borough','county council','city council','trust','nhs trust','nhs foundation','police','fire','authority','health board','local authority'],
  universities: ['university','universities','college','business school','institute of technology','higher education','university of','school of'],
  blacklist: ['restaurant','takeaway','kebab','pizza','curry','cafe','coffee','chippy','fish and chips','hotel','guest house','b&b','pub','bar','nightclub','care home','nursing home','care agency','domiciliary care','grocery','supermarket','convenience store','off licence','butcher','bakery','hair','beauty','salon','barber','nail','tattoo','construction','builder','plumbing','electrical','roofing','scaffolding','taxi','cleaning','security','estate agent','letting','church','mosque','temple','gurdwara','charity','masjid','petrol station','garage','car wash','tyre','mot centre'],
  techWhitelist: ['technology','technologies','tech','software','systems','solutions','digital','data','ai','artificial intelligence','labs','lab','innovation','informatics','infotech','fintech','healthtech','edtech','proptech','biotech','cyber','cloud','web','app','apps','computing','computer','programming','information','analytics','intelligence','automation','platform','internet','online','develop']
};

const SCOTLAND_TOWNS = ['edinburgh','glasgow','aberdeen','dundee','stirling','inverness','perth','falkirk','ayr','dunfermline','greenock','paisley','kilmarnock','east kilbride','cumbernauld','hamilton','motherwell','coatbridge','livingston'];
const WALES_TOWNS = ['cardiff','swansea','newport','wrexham','barry','bridgend','neath','cwmbran','bangor','st davids','aberystwyth','merthyr','pontypridd','caerphilly','port talbot','llanelli'];
const NI_TOWNS = ['belfast','derry','londonderry','lisburn','newry','armagh','craigavon','newtownabbey','bangor','carrickfergus','antrim','down','newtownards','omagh','coleraine'];

function cleanName(name) {
  if (!name) return 'Unknown';
  let value = String(name)
    .replace(/\?{2,}/g, "'")
    .replace(/\uFFFD/g, "'")
    .replace(/â€™|â€œ|â€|Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã©/g, 'é')
    .normalize('NFKC')
    .trim()
    .replace(/\s{2,}/g, ' ');
  try {
    if (value.includes('%')) value = decodeURIComponent(value);
  } catch { /* keep original value */ }
  return value;
}

function cleanCareersUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  // A search-engine URL is not an authoritative careers URL. Keep it blank
  // rather than presenting it as if it were an employer careers page.
  if (/google\.com\/search/i.test(value)) return '';
  try {
    return value.includes('%') ? decodeURIComponent(value) : value;
  } catch {
    return value;
  }
}

function getRegion(town, county, name) {
  try {
    const t = String(town || '').toLowerCase();
    const c = String(county || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    if (SCOTLAND_TOWNS.some(x => t.includes(x)) || c.includes('scotland') || /\bscotland\b|\bedinburgh\b|\bglasgow\b/.test(n)) return 'Scotland';
    if (WALES_TOWNS.some(x => t.includes(x)) || c.includes('wales') || /\bwales\b|\bcardiff\b|\bswansea\b/.test(n)) return 'Wales';
    if (NI_TOWNS.some(x => t.includes(x)) || c.includes('northern ireland') || c.includes('antrim') || c.includes('down') || /\bbelfast\b/.test(n)) return 'Northern Ireland';
    return 'England';
  } catch {
    return 'England';
  }
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function safeGetItem(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (error) {
    console.error('LocalStorage read failed', error);
    return fallback;
  }
}
