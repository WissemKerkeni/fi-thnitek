import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'auth:public';
export const ADMIN_ONLY = 'auth:admin';

/** Routes are authenticated by default; mark the few public ones explicitly. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires `users.is_admin` (the ADMIN_EMAILS allow-list) → otherwise 403 ADMIN_REQUIRED. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

export interface AuthContext {
  userId: string;
  familyId: string;
  isAdmin: boolean;
}

export type AuthedRequest = Request & { auth?: AuthContext };

export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new Error('CurrentAuth used on a public route');
  return auth;
});
