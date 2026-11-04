import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '@common/enums/UserRole';
import { UserStatus } from '@common/enums/UserStatus';
import { UserEntity } from '@modules/users/entities/user.entity';

/** Claims we put into access tokens (see AuthService.issueToken). */
export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  /** UserEntity.tokenVersion at signing time. Absent in tokens issued before it existed. */
  tv?: number;
  exp?: number;
}

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Turns a verified JWT payload into the request user, checking it against the
 * database so that blocking, deleting, a password change or a role change
 * takes effect on the very next request.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
  ) {}

  async resolveSession(payload: JwtPayload): Promise<SessionUser | null> {
    // Tokens signed before expiry was configured never expire — refuse them.
    if (!payload?.id || !payload.exp) {
      return null;
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, status: true, tokenVersion: true },
    });

    if (
      !user ||
      user.status !== UserStatus.Active ||
      (payload.tv ?? 0) !== user.tokenVersion
    ) {
      return null;
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
