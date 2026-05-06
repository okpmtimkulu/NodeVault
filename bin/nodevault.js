#!/usr/bin/env node

import { createCli } from '../src/cli.js';
import { shouldLaunchTui, runTui } from '../src/tui/index.js';

process.title = 'nodevault';

const argv = process.argv.slice(2);

if (shouldLaunchTui(argv)) {
  await runTui();
} else {
  const program = createCli();
  program.parse(process.argv);
}
