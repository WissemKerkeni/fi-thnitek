import { describe, expect, it, vi } from 'vitest';
import { fetchHealth } from './api';

const health = {
  status: 'up',
  version: '0.0.0',
  time: '2026-10-02T10:00:00.000Z',
  checks: { database: 'up' },
};
const reply = (status: number, body: unknown) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

describe('fetchHealth', () => {
  it('calls /v1/health and validates the contract', async () => {
    const fetchImpl = reply(200, health);
    await expect(fetchHealth('http://localhost:3000/', fetchImpl)).resolves.toEqual(health);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/v1/health', expect.anything());
  });

  it('accepts a 503 health body', async () => {
    const down = { ...health, status: 'down', checks: { database: 'down' } };
    await expect(fetchHealth('http://api', reply(503, down))).resolves.toEqual(down);
  });

  it('throws on other errors and on contract violations', async () => {
    await expect(fetchHealth('http://api', reply(500, {}))).rejects.toThrow('HTTP 500');
    await expect(fetchHealth('http://api', reply(200, { status: 'great' }))).rejects.toThrow();
  });
});
