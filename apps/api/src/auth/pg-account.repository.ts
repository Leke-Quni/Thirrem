import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AccountRepository, DuplicateEmailError, type Account, type AppName } from './account.repository.js';

interface AccountRow {
  id: string;
  app: AppName;
  email: string;
  password_hash: string;
}

const UNIQUE_VIOLATION = '23505';
const SCHEMA_LOCK_ID = 7001;

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  app: row.app,
  email: row.email,
  passwordHash: row.password_hash,
});

@Injectable()
export class PgAccountRepository extends AccountRepository implements OnModuleInit {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.database.query(`
      SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_ID});
      CREATE TABLE IF NOT EXISTS accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        app text NOT NULL,
        email text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (app, email)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash text PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES accounts(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
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

  async saveSession(tokenHash: string, accountId: string): Promise<void> {
    await this.database.query('INSERT INTO sessions (token_hash, account_id) VALUES ($1, $2)', [tokenHash, accountId]);
  }

  async findBySessionTokenHash(app: AppName, tokenHash: string): Promise<Account | null> {
    const { rows } = await this.database.query<AccountRow>(
      `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND a.app = $2`,
      [tokenHash, app],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }
}
