import { expandPath } from '../config.js';
import { createWatcher } from '../daemon/watcher.js';
import { getDb } from '../db/database.js';
import { ensureStoreExists } from '../core/store.js';
import * as output from '../output.js';

export function watchCommand(targetPath) {
  const resolvedPath = expandPath(targetPath || '.');

  // Initialize dependencies
  getDb();
  ensureStoreExists();

  output.success(`Watching ${resolvedPath} for new node_modules...`);
  output.dim('Press Ctrl+C to stop');
  console.log();

  const watcher = createWatcher([resolvedPath], {
    log: (msg) => console.log(msg),
  });

  // Keep process alive
  process.on('SIGINT', () => {
    console.log();
    output.info('Stopped watching');
    watcher.close();
    process.exit(0);
  });
}
