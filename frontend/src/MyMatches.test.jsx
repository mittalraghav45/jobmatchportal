import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MyMatches from './MyMatches';

const apiPayload = {
  jobs: [{
    _id: 'job-1',
    title: 'Frontend Software Engineer',
    companyName: 'Example Tech',
    location: 'London',
    nation: 'England',
    sponsorship: 'verified',
    applicationUrl: 'https://example.com/apply',
    ats: 'greenhouse',
    matchedSkills: ['React', 'TypeScript'],
  }],
};

describe('MyMatches', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('shows loading state while the matching API is pending', () => {
    fetch.mockReturnValue(new Promise(() => {}));
    render(<MyMatches />);
    expect(screen.getByText(/Loading your matches/i)).toBeTruthy();
  });

  it('renders job details, sponsorship, skills and the application link', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => apiPayload });
    render(<MyMatches />);
    expect(await screen.findByText('Frontend Software Engineer')).toBeTruthy();
    expect(screen.getByText('Example Tech')).toBeTruthy();
    expect(screen.getByText(/London · England/)).toBeTruthy();
    expect(screen.getByText(/Sponsorship: verified/i)).toBeTruthy();
    expect(screen.getByText('React')).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apply' }).getAttribute('href')).toBe('https://example.com/apply');
  });

  it('does not create a fake application URL when none exists', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ jobs: [{ title: 'Backend Engineer', companyName: 'No ATS Ltd' }] }) });
    render(<MyMatches />);
    await waitFor(() => expect(screen.getByText('Backend Engineer')).toBeTruthy());
    expect(screen.queryByRole('link', { name: 'Apply' })).toBeNull();
    expect(screen.getByRole('button', { name: /No application link/i })).toBeTruthy();
  });

  it('shows an empty state when the API returns no jobs', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ jobs: [] }) });
    render(<MyMatches />);
    expect(await screen.findByText(/No matches were returned/i)).toBeTruthy();
  });

  it('shows an API error state when the request fails', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 });
    render(<MyMatches />);
    expect(await screen.findByText(/Matching API returned 500/i)).toBeTruthy();
  });

  it('posts the expected matching request', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ jobs: [] }) });
    render(<MyMatches profileId="candidate-123" limit={10} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/match/jobs'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ profileId: 'candidate-123', page: 1, limit: 10 }) }),
    );
  });
});
