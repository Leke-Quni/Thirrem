export type AppName = 'rider';

export interface Account {
  id: string;
  app: AppName;
  email: string;
  passwordHash: string;
}

export class DuplicateEmailError extends Error {}

export abstract class AccountRepository {
  abstract create(app: AppName, email: string, passwordHash: string): Promise<Account>;
  abstract findByEmail(app: AppName, email: string): Promise<Account | null>;
  abstract saveSession(tokenHash: string, accountId: string, expiresAt: Date): Promise<void>;
  abstract findBySessionTokenHash(app: AppName, tokenHash: string, now: Date): Promise<Account | null>;
}
