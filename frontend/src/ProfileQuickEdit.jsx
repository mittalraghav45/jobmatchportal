import React, { useEffect, useState } from 'react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export default function ProfileQuickEdit() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', location: '', yearsExperience: 2.5, skills: '', summary: '', cvText: '' });

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/api/profile/default`).then(r => r.json()).then(d => {
      const p = d.profile || {};
      setForm({ name: p.name || '', location: p.location || '', yearsExperience: p.yearsExperience ?? 2.5, skills: (p.skills || []).join(', '), summary: p.summary || '', cvText: p.cvText || '' });
    }).catch(e => setMessage(e.message));
  }, [open]);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`${API}/api/profile/default`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, yearsExperience: Number(form.yearsExperience), skills: form.skills.split(',').map(x => x.trim()).filter(Boolean) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save profile');
      setMessage('Profile saved');
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  };

  return <>
    <button className="profile-fab" onClick={() => setOpen(true)}>Profile</button>
    {open && <div className="profile-overlay" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="profile-modal">
        <div className="modal-head"><div><h2>Your matching profile</h2><p>Used by the deterministic and OpenAI matching engines.</p></div><button onClick={() => setOpen(false)}>×</button></div>
        <div className="profile-grid">
          <label>Name<input value={form.name} onChange={e => update('name', e.target.value)} /></label>
          <label>Location<input value={form.location} onChange={e => update('location', e.target.value)} /></label>
          <label>Years experience<input type="number" min="0" step="0.5" value={form.yearsExperience} onChange={e => update('yearsExperience', e.target.value)} /></label>
          <label>Skills<input value={form.skills} onChange={e => update('skills', e.target.value)} placeholder="React, TypeScript, Node.js, AWS" /></label>
        </div>
        <label>Professional summary<textarea value={form.summary} onChange={e => update('summary', e.target.value)} /></label>
        <label>CV text<textarea className="cv-text" value={form.cvText} onChange={e => update('cvText', e.target.value)} placeholder="Paste your CV text here for stronger evidence matching." /></label>
        <div className="modal-actions"><span>{message}</span><button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save profile'}</button></div>
      </div>
    </div>}
  </>;
}
