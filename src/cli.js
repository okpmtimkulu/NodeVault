import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { linkCommand } from './commands/link.js';
import { cleanCommand } from './commands/clean.js';
import { pruneCommand } from './commands/prune.js';
import { unlinkCommand } from './commands/unlink.js';
import { statusCommand } from './commands/status.js';
import { listCommand } from './commands/list.js';
import { daemonCommand } from './commands/daemon.js';
import { watchCommand } from './commands/watch.js';
import { runTui } from './tui/index.js';

export function createCli() {
  const program = new Command();

  program
    .name('nodevault')
    .description('Stop downloading node_modules 30 times. Install once, share everywhere.')
    .version('0.1.0');

  program
    .command('init')
    .description('Initialize the central store')
    .action(async () => {
      await initCommand();
    });

  program
    .command('scan [path]')
    .description('Discover all projects with node_modules')
    .option('-d, --depth <n>', 'Limit search depth', parseInt)
    .action((targetPath, options) => scanCommand(targetPath, options));

  program
    .command('link [project]')
    .description('Link project dependencies to the central store')
    .option('-a, --all', 'Link all tracked projects')
    .option('-s, --strategy <type>', 'Linking strategy: hardlink, symlink, or copy')
    .action((target, options) => linkCommand(target, options));

  program
    .command('clean')
    .description('Remove node_modules from stale/archived projects')
    .option('--stale', 'Only clean stale projects')
    .option('--archived', 'Only clean archived projects')
    .option('-a, --all', 'Clean all stale and archived')
    .option('-f, --force', 'Skip confirmation')
    .action((options) => cleanCommand(options));

  program
    .command('prune')
    .description('Remove unreferenced packages from the store')
    .option('-f, --force', 'Skip confirmation')
    .action((options) => pruneCommand(options));

  program
    .command('unlink [project]')
    .description('Restore independent node_modules for a project')
    .action((target) => unlinkCommand(target));

  program
    .command('status')
    .description('Show store health and project overview')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Include configuration details')
    .action(async (options) => {
      await statusCommand(options);
    });

  program
    .command('list')
    .description('List all tracked projects')
    .option('-s, --sort <field>', 'Sort by: name, size, accessed, status')
    .option('-f, --filter <value>', 'Filter by: active, stale, archived, npm, yarn, pnpm, linked, unlinked')
    .action((options) => listCommand(options));

  program
    .command('daemon <action>')
    .description('Manage the background daemon (start, stop, status, logs)')
    .action((action) => daemonCommand(action));

  program
    .command('watch [path]')
    .description('Watch a directory and link new projects as they appear')
    .action((targetPath) => watchCommand(targetPath));

  program
    .command('tui')
    .description('Interactive fullscreen session (same as: nodevault with no arguments)')
    .action(async () => {
      await runTui();
    });

  return program;
}
