import pg from 'pg';
import { loadConfig } from '../../src/config/app-config.js';
import { migrate } from '../../src/database/migrate.js';

/** An empty database of a test file's own, for what looks across every account. */
export async function ownDatabase(name: string): Promise<string> {
  const url = new URL(loadConfig().databaseUrl);
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${name}`);
  await client.end();
  url.pathname = `/${name}`;
  await migrate(url.href, () => undefined);
  return url.href;
}
