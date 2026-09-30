import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'jobmatch.candidateProfile';
const DEFAULT_PROFILE = {
  profileId: 'default',
  name: '',
  location: '',
  yearsExperience: 0,
  summary: '',
  skills: [],
  education: [],
  experience: [],
  certifications: [],
  workAuthorisation: {},
  preferences: { sponsorshipRequired: true },
  cvText: ''
};

export default function CandidateProfileEditor({ initialProfile = DEFAULT_PROFILE, onSaved }) {
  const [profile, setProfile] = useState(() => loadProfile(initialProfile));
  const [skillsText, setSkillsText] = useState((profile.skills || []).join(', '));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile(initialProfile));
    setSkillsText((initialProfile.skills || []).join(', '));
  }, [initialProfile]);

  const update = (field, value) => setProfile(current => ({ ...current, [field]: value }));

  const save = async event => {
    event.preventDefault();
    const next = {
      ...profile,
      profileId: profile.profileId || 'default',
      yearsExperience: Number(profile.yearsExperience || 0),
      skills: skillsText.split(',').map(x => x.trim()).filter(Boolean)
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);

    if (onSaved) await onSaved(next);
  };

  return (
    <section className="profile-editor">
      <div className="section-head">
        <div>
          <h2>Candidate profile</h2>
          <p>This is the source of truth for job matching and application generation.</p>
        </div>
        {saved && <span className="sponsor">Saved</span>}
      </div>

      <form onSubmit={save}>
        <label>
          Name
          <input value={profile.name || ''} onChange={e => update('name', e.target.value)} required />
        </label>

        <label>
          Location
          <input value={profile.location || ''} onChange={e => update('location', e.target.value)} />
        </label>

        <label>
          Years of experience
          <input type="number" min="0" step="0.1" value={profile.yearsExperience ?? 0} onChange={e => update('yearsExperience', e.target.value)} />
        </label>

        <label>
          Professional summary
          <textarea rows="4" value={profile.summary || ''} onChange={e => update('summary', e.target.value)} />
        </label>

        <label>
          Skills <small>(comma-separated)</small>
          <input value={skillsText} onChange={e => setSkillsText(e.target.value)} />
        </label>

        <label>
          CV text
          <textarea
            rows="12"
            value={profile.cvText || ''}
            onChange={e => update('cvText', e.target.value)}
            placeholder="Paste the factual text of your CV here."
          />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(profile.preferences?.sponsorshipRequired)}
            onChange={e => update('preferences', { ...(profile.preferences || {}), sponsorshipRequired: e.target.checked })}
          />
          Sponsorship required
        </label>

        <button className="primary" type="submit">Save candidate profile</button>
      </form>
    </section>
  );
}

function loadProfile(fallback) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_PROFILE, ...JSON.parse(stored) } : { ...DEFAULT_PROFILE, ...fallback };
  } catch {
    return { ...DEFAULT_PROFILE, ...fallback };
  }
}
