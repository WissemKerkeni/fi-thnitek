import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GoogleSignInRequest,
  RefreshRequest,
  type SignInResponse,
  type TokenPair,
} from '@fi-thnitek/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { type AuthContext, CurrentAuth, Public } from './decorators.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  signIn(
    @Body(new ZodValidationPipe(GoogleSignInRequest)) body: GoogleSignInRequest,
  ): Promise<SignInResponse> {
    return this.auth.signInWithGoogle(body.idToken, body.device);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodValidationPipe(RefreshRequest)) body: RefreshRequest): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentAuth() auth: AuthContext): Promise<void> {
    return this.auth.logout(auth.userId, auth.familyId);
  }
}
