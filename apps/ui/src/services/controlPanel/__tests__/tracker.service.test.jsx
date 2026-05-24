import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../utils/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [{ id: 1 }, { id: 2 }] })) }
}));

import axios from '../../../utils/axios';

import { fetchGitHubIssuesService } from '../tracker.service';

describe('fetchGitHubIssuesService', () => {
  it('GETs the configured controlPanel/gitHubIssues endpoint and returns the response', async () => {
    import.meta.env.VITE_CONTROL_PANEL_API = 'http://api.test';
    const response = await fetchGitHubIssuesService();
    expect(axios.get).toHaveBeenCalledWith('http://api.test/controlPanel/gitHubIssues');
    expect(response.data).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
