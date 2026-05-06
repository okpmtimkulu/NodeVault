import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config.js';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Acquire an advisory filesystem lock. Best-effort mutual exclusion
 * for cooperative CLI invocations — not a security guarantee.
 *
 * @returns {{ release: () => void }} Call release() when done.
 * @throws {Error} If lock is already held by a live process.
 */
export function acquireLock() {
  const LOCK_FILE = path.join(paths.nodevaultDir, 'operations.lock');

  // Check for stale lock from a crashed process
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const content = fs.readFileSync(LOCK_FILE, 'utf-8');
      const { pid, timestamp } = JSON.parse(content);

      // Check if the process is still alive
      let alive = false;
      try {
        process.kill(pid, 0); // signal 0 = existence check
        alive = true;
      } catch {
        alive = false;
      }

      if (alive && (Date.now() - timestamp) < STALE_THRESHOLD_MS) {
        throw new Error(
          `Another nodevault operation is running (PID ${pid}). ` +
          `If this is wrong, remove ${LOCK_FILE}`
        );
      }

      // Stale lock — remove it
      fs.unlinkSync(LOCK_FILE);
    } catch (err) {
      if (err.message.includes('Another nodevault')) throw err;
      // Corrupted lock file — remove and continue
      try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    }
  }

  // Create lock file exclusively
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    const content = JSON.stringify({ pid: process.pid, timestamp: Date.now() });
    fs.writeSync(fd, content);
    fs.closeSync(fd);
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(
        'Another nodevault operation is running. ' +
        `If this is wrong, remove ${LOCK_FILE}`
      );
    }
    throw err;
  }

  // Auto-cleanup on exit
  const cleanup = () => {
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
  };
  process.on('exit', cleanup);

  return {
    release() {
      cleanup();
      process.removeListener('exit', cleanup);
    },
  };
}
