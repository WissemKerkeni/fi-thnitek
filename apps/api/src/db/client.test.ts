import { describe, expect, it, vi } from 'vitest';
import { createPool } from './client.js';

describe('createPool', () => {
  it('survives an idle connection dropped by the server instead of crashing the process', async () => {
    const onIdleError = vi.fn();
    const pool = createPool('postgres://user:pass@127.0.0.1:1/none', 1, onIdleError);
    // What pg emits when the server closes an idle client (e.g. a database restart).
    pool.emit('error', new Error('Connection terminated unexpectedly'), {});
    expect(onIdleError).toHaveBeenCalledTimes(1);
    expect(onIdleError.mock.calls[0]?.[0]).toMatchObject({ message: 'Connection terminated unexpectedly' });
    await pool.end();
  });
});
