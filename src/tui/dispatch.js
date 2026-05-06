import { initCommand } from '../commands/init.js';
import { scanCommand } from '../commands/scan.js';
import { linkCommand } from '../commands/link.js';
import { statusCommand } from '../commands/status.js';
import { listCommand } from '../commands/list.js';
import { cleanCommand } from '../commands/clean.js';
import { pruneCommand } from '../commands/prune.js';
import { unlinkCommand } from '../commands/unlink.js';
import { daemonCommand } from '../commands/daemon.js';
import { watchCommand } from '../commands/watch.js';
import * as output from '../output.js';

/**
 * @param {string} name
 * @param {string} args
 * @param {{ session?: boolean }} [options] — session: TUI in-process (non-interactive clean/prune; watch deferred)
 */
export async function runTuiCommand(name, args, options = {}) {
  const a = (args || '').trim();
  const session = !!options.session;

  switch (name) {
    case 'init':
      await initCommand();
      return;
    case 'status':
      await statusCommand({});
      return;
    case 'scan':
      await scanCommand(a || undefined, {});
      return;
    case 'link':
      if (!a) {
        output.warn('Specify a project path, or use /link --all to link everything.');
        return;
      }
      await linkCommand(a, { all: a === '--all' });
      return;
    case 'link-paths': {
      const pathList = a
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      await linkCommand(undefined, { paths: pathList });
      return;
    }
    case 'list':
      await listCommand({});
      return;
    case 'clean':
      if (session) {
        output.info('TUI: cleaning all stale + archived projects (same as clean -a -f). Use CLI for prompts.');
        await cleanCommand({ all: true, force: true });
      } else {
        await cleanCommand({});
      }
      return;
    case 'prune':
      if (session) {
        output.info('TUI: pruning without prompt (same as prune -f). Use CLI to review the table first.');
        await pruneCommand({ force: true });
      } else {
        await pruneCommand({});
      }
      return;
    case 'unlink':
      await unlinkCommand(a || undefined);
      return;
    case 'daemon': {
      const action = (a || 'status').trim().split(/\s+/)[0];
      if (session && (action === 'start' || action === 'stop')) {
        output.info('Daemon start/stop: use a normal terminal — nodevault daemon <start|stop>');
        return;
      }
      await daemonCommand(a || 'status');
      return;
    }
    case 'watch':
      if (session) {
        output.info('Watch blocks the terminal — run: nodevault watch [path]');
        return;
      }
      await watchCommand(a || undefined);
      return;
    default:
      output.error(`Unknown command: ${name}`);
  }
}
