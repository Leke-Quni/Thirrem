import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AccountRepository, DuplicateEmailError, type Account, type AppName } from './account.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { passwordRequirementMessage, unmetPasswordRules } from './password-policy.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Session {
  email: string;
  token: string;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async signup(app: AppName, email: unknown, password: unknown): Promise<Session> {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      throw new BadRequestException('A valid email is required');
    }
    if (typeof password !== 'string') throw new BadRequestException(passwordRequirementMessage(unmetPasswordRules('')));
    const unmet = unmetPasswordRules(password);
    if (unmet.length > 0) throw new BadRequestException(passwordRequirementMessage(unmet));
    try {
      const account = await this.accounts.create(app, normaliseEmail(email), await this.hasher.hash(password));
      return this.openSession(account);
    } catch (error) {
      if (error instanceof DuplicateEmailError) throw new ConflictException('An account with this email already exists');
      throw error;
    }
  }

  async login(app: AppName, email: unknown, password: unknown): Promise<Session> {
    const invalid = new UnauthorizedException('Invalid email or password');
    if (typeof email !== 'string' || typeof password !== 'string') throw invalid;
    const account = await this.accounts.findByEmail(app, normaliseEmail(email));
    if (!account || !(await this.hasher.verify(password, account.passwordHash))) throw invalid;
    return this.openSession(account);
  }

  async authenticate(app: AppName, token: string | undefined): Promise<Account> {
    const account = token ? await this.accounts.findBySessionTokenHash(app, hashToken(token)) : null;
    if (!account) throw new UnauthorizedException('Log in to continue');
    return account;
  }

  private async openSession(account: Account): Promise<Session> {
    const token = randomBytes(32).toString('hex');
    await this.accounts.saveSession(hashToken(token), account.id);
    return { email: account.email, token };
  }
}
