import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Throttle } from '../common/throttle/throttle.decorator.js';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator.js';
import type { Env } from '../core/env.validation.js';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthUser } from './auth.types.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto/auth-request.dto.js';
import {
  AccessTokenResponse,
  AuthSessionResponse,
  AuthUserResponse,
} from './dto/auth-response.dto.js';
import { Public } from './public.decorator.js';
import { clearRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

/** Reads the refresh token from the request cookies. */
function refreshTokenOf(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE
  ];
  return typeof value === 'string' && value ? value : undefined;
}

/** Account routes. They return plain JSON (no `data` envelope) as the API contract says. */
@ApiTags('Auth')
@SkipEnvelope()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Creates an account and sets the refresh cookie. */
  @Public()
  @Throttle(10)
  @Post('register')
  @ApiCreatedResponse({ type: AuthSessionResponse })
  @ApiConflictResponse({ description: '`EMAIL_TAKEN`' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const { user, accessToken, refreshToken } = await this.auth.register(dto);
    setRefreshCookie(res, this.config, refreshToken);
    return { user, accessToken };
  }

  /** Signs in and sets the refresh cookie. */
  @Public()
  @Throttle(10)
  @HttpCode(200)
  @Post('login')
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiUnauthorizedResponse({ description: '`INVALID_CREDENTIALS`' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const { user, accessToken, refreshToken } = await this.auth.login(dto);
    setRefreshCookie(res, this.config, refreshToken);
    return { user, accessToken };
  }

  /** Rotates the refresh cookie and returns a new access token. */
  @Public()
  @HttpCode(200)
  @Post('refresh')
  @ApiOkResponse({ type: AccessTokenResponse })
  @ApiUnauthorizedResponse({ description: '`REFRESH_INVALID`' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const { accessToken, refreshToken } = await this.auth.refresh(
      refreshTokenOf(req),
    );
    setRefreshCookie(res, this.config, refreshToken);
    return { accessToken };
  }

  /** Revokes the refresh token and clears the cookie. */
  @Public()
  @HttpCode(204)
  @Post('logout')
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(refreshTokenOf(req));
    clearRefreshCookie(res, this.config);
  }

  /** Returns the signed-in user. */
  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: AuthUserResponse })
  me(@CurrentUser() user: AuthUser): Promise<AuthUserResponse> {
    return this.auth.me(user.id);
  }

  /** Updates name, email or avatar. */
  @ApiBearerAuth()
  @Put('profile')
  @ApiOkResponse({ type: AuthUserResponse })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthUserResponse> {
    return this.auth.updateProfile(user.id, dto);
  }

  /** Anonymises the account. */
  @ApiBearerAuth()
  @HttpCode(204)
  @Delete('profile')
  @ApiNoContentResponse()
  deleteAccount(@CurrentUser() user: AuthUser): Promise<void> {
    return this.auth.deleteAccount(user.id);
  }

  /** Changes the password. */
  @ApiBearerAuth()
  @HttpCode(204)
  @Post('change-password')
  @ApiNoContentResponse()
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(user.id, dto);
  }

  /** Starts a password reset; always 204. */
  @Public()
  @Throttle(10)
  @HttpCode(204)
  @Post('forgot-password')
  @ApiNoContentResponse()
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(dto.email);
  }

  /** Completes a password reset. */
  @Public()
  @Throttle(10)
  @HttpCode(204)
  @Post('reset-password')
  @ApiNoContentResponse()
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }
}
