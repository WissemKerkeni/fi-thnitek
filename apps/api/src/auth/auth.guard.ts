import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { accountAccess } from '@fi-thnitek/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiException } from '../common/api-exception.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { sessions, users } from '../db/schema/index.js';
import { ADMIN_ONLY, type AuthedRequest, IS_PUBLIC } from './decorators.js';
import { ACCESS_TOKENS, type AccessTokens } from './tokens.js';

/**
 * Global guard. Besides the JWT, it checks on every request that the session family is still live and
 * the account ACTIVE, so logout, reuse detection, suspension and bans take effect immediately
 * (not after the 15-min token lifetime). One indexed lookup per request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKENS) private readonly tokens: AccessTokens,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED);

    const claims = await this.tokens.verify(token);
    const [row] = await this.db
      .select({ status: users.status, isAdmin: users.isAdmin })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.familyId, claims.familyId),
          eq(sessions.userId, claims.userId),
          isNull(sessions.revokedAt),
        ),
      )
      .limit(1);
    if (!row) throw new ApiException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'The session has ended');

    const access = accountAccess(row.status);
    if (access === 'ACCOUNT_SUSPENDED' || access === 'ACCOUNT_BANNED') {
      throw new ApiException(access, HttpStatus.FORBIDDEN);
    }
    if (access !== 'OK') throw new ApiException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED);

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) && !row.isAdmin) {
      throw new ApiException('ADMIN_REQUIRED', HttpStatus.FORBIDDEN);
    }
    req.auth = { userId: claims.userId, familyId: claims.familyId, isAdmin: row.isAdmin };
    return true;
  }
}
