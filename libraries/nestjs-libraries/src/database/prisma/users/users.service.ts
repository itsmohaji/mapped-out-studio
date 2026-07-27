import { HttpException, Injectable } from '@nestjs/common';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { Provider } from '@prisma/client';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@gitroom/nestjs-libraries/dtos/users/email-notifications.dto';
import { ChangePasswordDto } from '@gitroom/nestjs-libraries/dtos/users/change.password.dto';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private _usersRepository: UsersRepository,
    private _organizationRepository: OrganizationRepository
  ) {}

  getUserByEmail(email: string) {
    return this._usersRepository.getUserByEmail(email);
  }

  getUserByEmailOrUsername(identifier: string) {
    return this._usersRepository.getUserByEmailOrUsername(identifier);
  }

  getUserByUsername(username: string) {
    return this._usersRepository.getUserByUsername(username);
  }

  createUserForInvite(
    body: {
      email: string;
      password?: string;
      provider: Provider;
      providerId?: string;
      username?: string;
    },
    hasEmail: boolean,
    ip: string,
    userAgent: string
  ) {
    return this._usersRepository.createUserForInvite(
      body,
      hasEmail,
      ip,
      userAgent
    );
  }

  getUserById(id: string) {
    return this._usersRepository.getUserById(id);
  }

  getImpersonateUser(name: string) {
    return this._organizationRepository.getImpersonateUser(name);
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._usersRepository.getUserByProvider(providerId, provider);
  }

  activateUser(id: string) {
    return this._usersRepository.activateUser(id);
  }

  updatePassword(id: string, password: string) {
    return this._usersRepository.updatePassword(id, password);
  }

  getPersonal(userId: string) {
    return this._usersRepository.getPersonal(userId);
  }

  changePersonal(userId: string, body: UserDetailDto) {
    return this._usersRepository.changePersonal(userId, body);
  }

  async changePassword(userId: string, body: ChangePasswordDto) {
    const user = await this._usersRepository.getUserById(userId);
    if (!user) {
      throw new HttpException('User not found', 400);
    }
    if (user.providerName !== Provider.LOCAL || !user.password) {
      throw new HttpException(
        'Password change is not available for social login accounts',
        400
      );
    }
    if (!AuthService.comparePassword(body.password, user.password)) {
      throw new HttpException('Current password is incorrect', 400);
    }
    await this._usersRepository.updatePassword(userId, body.newPassword);
    return { success: true };
  }

  getEmailNotifications(userId: string) {
    return this._usersRepository.getEmailNotifications(userId);
  }

  updateEmailNotifications(userId: string, body: EmailNotificationsDto) {
    return this._usersRepository.updateEmailNotifications(userId, body);
  }
}
