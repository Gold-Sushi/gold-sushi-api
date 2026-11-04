import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { resolveSiteDomain, siteUrl } from '@common/site.constants';
import { UserEntity } from '@modules/users/entities/user.entity';
import { UserStatus } from '@common/enums/UserStatus';
import { BcryptService } from '../../utils/bcrypt/bcrypt.service';
import { normalizeEmail } from '../../utils/email/normalize-email';
import { MailService } from '../../mail/mail.service';
import {
  PASSWORD_RESET_GENERIC_MESSAGE,
  PASSWORD_RESET_TTL_MINUTES,
} from './password.constants';
import { JwtPayload } from './session.service';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private userRepository: Repository<UserEntity>,
    private readonly bcryptService: BcryptService,
    private jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string): Promise<UserEntity | null> {
    const user = await this.userRepository.findOne({
      where: { email: normalizeEmail(email) },
    });

    if (!user) {
      return null;
    }

    // Guest accounts created during checkout have no password set.
    if (!user.password) {
      return null;
    }

    const isValid = await this.bcryptService.verifyPassword(
      pass,
      user.password,
    );

    if (!isValid) {
      return null;
    }

    // Only after the password matched, so this does not reveal the account.
    if (user.status === UserStatus.Blocked) {
      throw new ForbiddenException('Обліковий запис заблоковано');
    }

    return user.status === UserStatus.Active ? user : null;
  }

  async login(user: UserEntity) {
    const { id, email, role } = user;

    await this.userRepository.update(id, { lastLoginAt: new Date() });

    return {
      id,
      email,
      role,
      access_token: this.issueToken(user),
    };
  }

  /** Signs an access token bound to the user's current token version. */
  private issueToken({ id, email, role, tokenVersion }: UserEntity): string {
    const payload: JwtPayload = { id, email, role, tv: tokenVersion };
    return this.jwtService.sign(payload);
  }

  /**
   * Issue a reset token and email the link.
   *
   * Always resolves with the same message: revealing whether the address is
   * registered would turn this endpoint into an account enumeration oracle.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: normalizeEmail(email) },
    });

    // Guests (no password) have nothing to reset — they need to register.
    if (user?.password && user.status === UserStatus.Active) {
      const token = randomBytes(32).toString('hex');

      user.passwordResetTokenHash = this.hashToken(token);
      user.passwordResetExpiresAt = new Date(
        Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000,
      );

      await this.userRepository.save(user);

      // Fire-and-forget: a failing mail server must not leak through the
      // response, which has to stay identical for unknown addresses.
      void this.mailService.sendPasswordResetEmail(
        { email: user.email, firstName: user.firstName },
        this.buildResetUrl(token),
        PASSWORD_RESET_TTL_MINUTES,
      );
    }

    return { message: PASSWORD_RESET_GENERIC_MESSAGE };
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ message: string }> {
    const user = await this.findUserByResetToken(token);

    if (!user) {
      throw new BadRequestException(
        'Посилання для відновлення паролю недійсне або застаріле',
      );
    }

    user.password = await this.bcryptService.hashPassword(
      password,
      SALT_ROUNDS,
    );
    this.clearResetToken(user);
    this.revokeSessions(user);

    await this.userRepository.save(user);

    return { message: 'Пароль успішно змінено' };
  }

  /**
   * Signs out every other session. The response carries a fresh token so
   * the session that made the change stays logged in.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string; access_token: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user?.password) {
      throw new UnauthorizedException('Невірний поточний пароль');
    }

    const isValid = await this.bcryptService.verifyPassword(
      currentPassword,
      user.password,
    );

    if (!isValid) {
      throw new UnauthorizedException('Невірний поточний пароль');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'Новий пароль має відрізнятися від поточного',
      );
    }

    user.password = await this.bcryptService.hashPassword(
      newPassword,
      SALT_ROUNDS,
    );
    // A pending reset link is obsolete once the password changes by hand.
    this.clearResetToken(user);
    this.revokeSessions(user);

    await this.userRepository.save(user);

    return {
      message: 'Пароль успішно змінено',
      access_token: this.issueToken(user),
    };
  }

  /**
   * Only the digest is stored, so the raw token in the email is the single
   * copy that can be used. SHA-256 (not bcrypt) because we look the user up
   * *by* the hash — the token itself carries 256 bits of entropy, so a slow
   * hash would buy nothing.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private findUserByResetToken(token: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: {
        passwordResetTokenHash: this.hashToken(token),
        passwordResetExpiresAt: MoreThan(new Date()),
      },
    });
  }

  /** Makes the token single-use. */
  private clearResetToken(user: UserEntity): void {
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
  }

  /** Invalidates every token issued before the password changed. */
  private revokeSessions(user: UserEntity): void {
    user.passwordChangedAt = new Date();
    user.tokenVersion += 1;
  }

  private buildResetUrl(token: string): string {
    const configured = this.configService.get<string>('PASSWORD_RESET_URL');
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      siteUrl(resolveSiteDomain((key) => this.configService.get<string>(key)));
    const base =
      configured || `${frontendUrl.replace(/\/$/, '')}/reset-password`;

    return `${base}?token=${encodeURIComponent(token)}`;
  }
}
