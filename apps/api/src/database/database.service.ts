import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://thirrem:thirrem@localhost:5433/thirrem',
  });

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
