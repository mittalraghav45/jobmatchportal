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
    closingAt: '2026-10-15T23:59:59.000Z',
    postedAt: '2026-09-25T09:00:00.000Z',
    isLive: true,
    liveState: 'live',
  }],
};

describe('MyMatches', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('shows loading state while the matching API is pending', () => {
    fetch.mockReturnValue(new Promise(() => {}));
    render(<MyMatches initiallyOpen />);
    expect(screen.getByText(/Loading your matches/i)).toBeTruthy();
  });

  it('renders job details, sponsorship, skills, status, closing date and the application link', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => apiPayload });
    render(<MyMatches initiallyOpen />);
    expect(await screen.findByText('Frontend Software Engineer')).toBeTruthy();
    expect(screen.getByText('Example Tech')).toBeTruthy();
    expect(screen.getByText(/London · England/)).toBeTruthy();
    expect(screen.getByText(/Sponsorship: verified/i)).toBeTruthy();
    expect(screen.getByText('React')).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('Closes: 15 Oct 2026')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apply' }).getAttribute('href')).toBe('https://example.com/apply');
  });

  it('does not create a fake application URL when none exists', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ jobs: [{ title: 'Backend Engineer', companyName: 'No ATS Ltd', liveState: 'live' }] }) });
    render(<MyMatches initiallyOpen />);
    await waitFor(() => expect(screen.getByText('Backend Engineer')).toBeTruthy());
    expect(screen.queryByRole('link', { name: 'Apply' })).toBeNull();
    expect(screen.getByRole('button', { name: /Application not verified/i })).toBeTruthy();
  });

  it('shows a closed status and disables Apply for a closed job', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [{ title: 'Closed Engineer', companyName: 'Example Ltd', isLive: false, liveState: 'closed', closingAt: '2026-09-30T23:59:59.000Z', applicationUrl: 'https://example.com/apply' }] }),
    });
    render(<MyMatches initiallyOpen />);
    expect(await screen.findByText('Closed')).toBeTruthy();
    expect(screen.getByText('Closes: 30 Sept 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Job closed' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Apply' })).toBeNull();
  });

  it('shows unavailable status and closing date when the source cannot verify them', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [{ title: 'Unverified Engineer', companyName: 'Unknown Ltd', liveState: 'unknown' }] }),
    });
    render(<MyMatches initiallyOpen />);
    expect(await screen.findByText('Status not available')).toBeTruthy();
    expect(screen.getByText('Closes: Not available')).toBeTruthy();
    expect(screen.getByText(/Live status could not be verified/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Application not verified' })).toBeTruthy();
  });

  it('does not render a fake ATS object marker', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [{ title: 'ATS Engineer', companyName: 'Example Ltd', ats: { platform: 'greenhouse' }, liveState: 'unknown' }] }),
    });
    render(<MyMatches initiallyOpen />);
    expect(await screen.findByText('ATS: greenhouse')).toBeTruthy();
    expect(screen.queryByText(/\[object Object\]/i)).toBeNull();
  });

  it('shows an empty state when the API returns no jobs', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ jobs: [] }) });
    render(<MyMatches initiallyOpen />);
    expect(await screen.findByText(/No matches were returned/i)).toBeTruthy();
  });

  it('shows an API error state when the request fails', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 });
    render(<MyMatches initiallyOpen />);
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
