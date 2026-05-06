import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.join(__dirname, 'daemon-entry.js');

export function isDaemonRunning() {
  if (!fs.existsSync(paths.pidPath)) return false;

  try {
    const pid = parseInt(fs.readFileSync(paths.pidPath, 'utf-8').trim(), 10);
    process.kill(pid, 0); // signal 0 = check if alive
    return pid;
  } catch {
    // Stale PID file
    try { fs.unlinkSync(paths.pidPath); } catch { /* ignore */ }
    return false;
  }
}

export function startDaemon() {
  const existing = isDaemonRunning();
  if (existing) {
    return { alreadyRunning: true, pid: existing };
  }

  const child = spawn(process.execPath, [DAEMON_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NODEVAULT_DAEMON: '1' },
  });

  child.unref();
  fs.writeFileSync(paths.pidPath, String(child.pid));

  return { alreadyRunning: false, pid: child.pid };
}

export function stopDaemon() {
  const pid = isDaemonRunning();
  if (!pid) {
    return { wasRunning: false };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch { /* already dead */ }

  try { fs.unlinkSync(paths.pidPath); } catch { /* ignore */ }
  try { fs.unlinkSync(paths.portPath); } catch { /* ignore */ }

  return { wasRunning: true, pid };
}

export function getDaemonPort() {
  try {
    return parseInt(fs.readFileSync(paths.portPath, 'utf-8').trim(), 10);
  } catch {
    return null;
  }
}
