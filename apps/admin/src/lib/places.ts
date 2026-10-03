import { AdminPlace, AdminPlaceList, type PlaceInput } from '@fi-thnitek/contracts';
import { z } from 'zod';
import { adminSession } from './admin-session';

/** "Content → Places". Writes are audited on the server and lock the row against dataset re-imports. */
export const placesApi = {
  list: (q: string, page: number, pageSize: number) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim()) params.set('q', q.trim());
    return adminSession.request('GET', `/admin/places?${params.toString()}`, AdminPlaceList);
  },
  create: (input: PlaceInput) => adminSession.request('POST', '/admin/places', AdminPlace, input),
  update: (id: string, input: PlaceInput) =>
    adminSession.request('PUT', `/admin/places/${id}`, AdminPlace, input),
  remove: (id: string) => adminSession.request('DELETE', `/admin/places/${id}`, z.undefined()),
};
