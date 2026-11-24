import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AccountRepository, DuplicateEmailError, type Account, type AppName } from './account.repository.js';

interface AccountRow {
  id: string;
  app: AppName;
  email: string;
  password_hash: string;
}

const UNIQUE_VIOLATION = '23505';

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  app: row.app,
  email: row.email,
  passwordHash: row.password_hash,
});

@Injectable()
export class PgAccountRepository extends AccountRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async create(app: AppName, email: string, passwordHash: string): Promise<Account> {
    try {
      const { rows } = await this.database.query<AccountRow>(
        'INSERT INTO accounts (app, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
        [app, email, passwordHash],
      );
      return toAccount(rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new DuplicateEmailError(email);
      throw error;
    }
  }

  async findByEmail(app: AppName, email: string): Promise<Account | null> {
    const { rows } = await this.database.query<AccountRow>(
      'SELECT * FROM accounts WHERE app = $1 AND email = $2',
      [app, email],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async saveSession(tokenHash: string, accountId: string, expiresAt: Date): Promise<void> {
    await this.database.query('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [
      tokenHash,
      accountId,
      expiresAt,
    ]);
  }

  async findBySessionTokenHash(app: AppName, tokenHash: string, now: Date): Promise<Account | null> {
    const { rows } = await this.database.query<AccountRow>(
      `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND a.app = $2 AND s.expires_at > $3`,
      [tokenHash, app, now],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }
}
