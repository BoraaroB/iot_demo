import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import type { Logger } from '@iiot/logger';

/** Compiled migrations live next to this file: `dist/migrations/*.js`. */
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Applies pending migrations. `advisoryLockMode: 'wait'` lets several
 * replicas start at once: one migrates, the others block on the lock and
 * then find nothing to do. tsc also emits `.d.ts` and `.map` files into the
 * migrations dir, so those (and dotfiles) are ignored.
 */
export async function runMigrations(databaseUrl: string, logger: Logger): Promise<void> {
  const log = logger.child({ component: 'migrate' });
  const applied = await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    ignorePattern: String.raw`\..*|.*\.d\.ts|.*\.map`,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    singleTransaction: true,
    advisoryLockMode: 'wait',
    logger: {
      info: (msg) => log.debug(msg),
      warn: (msg) => log.warn(msg),
      error: (msg) => log.error(msg),
    },
  });
  log.info({ applied: applied.map((m) => m.name) }, 'Migrations up to date');
}
