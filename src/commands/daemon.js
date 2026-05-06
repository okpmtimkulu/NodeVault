import fs from 'node:fs';
import { startDaemon, stopDaemon, isDaemonRunning, getDaemonPort } from '../daemon/daemon.js';
import { paths } from '../config.js';
import * as output from '../output.js';

export function daemonCommand(action) {
  switch (action) {
    case 'start':
      daemonStart();
      break;
    case 'stop':
      daemonStop();
      break;
    case 'status':
      daemonStatus();
      break;
    case 'logs':
      daemonLogs();
      break;
    default:
      output.error(`Unknown daemon action: ${action}`);
      output.info('Usage: nodevault daemon <start|stop|status|logs>');
  }
}

function daemonStart() {
  const result = startDaemon();

  if (result.alreadyRunning) {
    output.warn(`Daemon already running (PID ${result.pid})`);
    const port = getDaemonPort();
    if (port) output.info(`Dashboard: http://127.0.0.1:${port}`);
  } else {
    output.success(`Daemon started (PID ${result.pid})`);
    output.info('Watching for new projects...');
    output.dim('View logs: nodevault daemon logs');
  }
}

function daemonStop() {
  const result = stopDaemon();

  if (result.wasRunning) {
    output.success(`Daemon stopped (PID ${result.pid})`);
  } else {
    output.info('Daemon is not running');
  }
}

function daemonStatus() {
  const pid = isDaemonRunning();

  if (pid) {
    output.success(`Daemon is running (PID ${pid})`);
    const port = getDaemonPort();
    if (port) output.info(`Dashboard: http://127.0.0.1:${port}`);
  } else {
    output.info('Daemon is not running');
  }
}

function daemonLogs() {
  if (!fs.existsSync(paths.logPath)) {
    output.info('No daemon logs yet');
    return;
  }

  const content = fs.readFileSync(paths.logPath, 'utf-8');
  const lines = content.trim().split('\n');
  // Show last 50 lines
  const recent = lines.slice(-50);
  for (const line of recent) {
    console.log(line);
  }
}
