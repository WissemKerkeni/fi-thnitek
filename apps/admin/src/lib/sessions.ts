import { AdminSessionDetail, AdminSessionList } from '@fi-thnitek/contracts';
import { z } from 'zod';
import { adminSession } from './admin-session';

/** "Drivers → sessions" (PRD §6). Session metadata only: no positions ever reach the admin. */
export const sessionsApi = {
  list: (active: boolean | undefined, page: number, pageSize: number) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (active !== undefined) params.set('active', String(active));
    return adminSession.request('GET', `/admin/sessions?${params.toString()}`, AdminSessionList);
  },
  detail: (id: string) => adminSession.request('GET', `/admin/sessions/${id}`, AdminSessionDetail),
  /** Reason ADMIN, no cooldown. Audited. */
  end: (id: string) => adminSession.request('POST', `/admin/sessions/${id}/end`, AdminSessionDetail),
  /** E.g. the battery died. Audited. */
  clearCooldown: (driverUserId: string) =>
    adminSession.request('POST', `/admin/drivers/${driverUserId}/clear-cooldown`, z.undefined()),
};
