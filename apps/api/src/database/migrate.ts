import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { loadConfig } from '../config/app-config.js';

export async function migrate(databaseUrl: string = loadConfig().databaseUrl, log: (message: string) => void = console.log): Promise<void> {
  await runner({
    databaseUrl,
    dir: fileURLToPath(new URL('../../migrations', import.meta.url)),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await migrate();
