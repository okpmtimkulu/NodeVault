import fs from 'node:fs';
import { loadConfig, paths } from '../config.js';
import { getDb } from '../db/database.js';
import { createWatcher } from './watcher.js';
import { createServer } from './server.js';
import { cleanStaging } from '../core/store.js';

// This is the actual daemon process — spawned detached from the CLI

const logFile = fs.createWriteStream(paths.logPath, { flags: 'a' });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  logFile.write(line);
}

async function main() {
  log('Daemon starting...');

  // Initialize DB
  getDb();

  // Clean any staging remnants from interrupted operations
  cleanStaging();

  const config = loadConfig();

  if (config.watchDirs.length === 0) {
    log('No watch directories configured. Set watchDirs in ~/.nodevault/config.json');
    log('Daemon will only serve the HTTP API.');
  }

  // Start file watcher
  let watcher = null;
  if (config.watchDirs.length > 0) {
    watcher = createWatcher(config.watchDirs, { log });
    log(`Watching: ${config.watchDirs.join(', ')}`);
  }

  // Start HTTP server
  try {
    const { port } = await createServer({ port: config.daemonPort });
    log(`HTTP server listening on port ${port}`);
  } catch (err) {
    log(`Failed to start HTTP server: ${err.message}`);
  }

  // Handle shutdown
  process.on('SIGTERM', () => {
    log('Daemon stopping (SIGTERM)...');
    if (watcher) watcher.close();
    try { fs.unlinkSync(paths.pidPath); } catch { /* ignore */ }
    try { fs.unlinkSync(paths.portPath); } catch { /* ignore */ }
    logFile.end();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('Daemon stopping (SIGINT)...');
    if (watcher) watcher.close();
    try { fs.unlinkSync(paths.pidPath); } catch { /* ignore */ }
    try { fs.unlinkSync(paths.portPath); } catch { /* ignore */ }
    logFile.end();
    process.exit(0);
  });

  log('Daemon ready.');
}

main().catch(err => {
  log(`Daemon fatal error: ${err.message}`);
  process.exit(1);
});
