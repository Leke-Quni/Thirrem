import { migrate } from '../../src/database/migrate.js';

export default async function setup(): Promise<void> {
  await migrate(undefined, () => undefined);
}
