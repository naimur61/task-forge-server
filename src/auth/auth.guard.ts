import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '../common/dto/api-response.dto.js';
import { ApiException } from '../common/exceptions/api.exception.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenService } from './token.service.js';

/** Resolves the bearer token on every request; 401 unless the route is public or the token is valid. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  /** Attaches the user to the request and rejects anonymous calls to non-public routes. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme === 'Bearer' && token) {
      const userId = await this.tokens.verifyAccess(token);
      if (userId) req.user = { id: userId };
    }

    if (isPublic || req.user) return true;
    throw new ApiException(
      401,
      ErrorCodes.UNAUTHORIZED,
      'Authentication required.',
    );
  }
}
