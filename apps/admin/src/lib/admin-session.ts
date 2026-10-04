import { createAdminSession } from './session';

/** The one admin session of this tab (shared by the auth provider and the pages). */
export const adminSession = createAdminSession();
