import { render } from 'ink';
import React from 'react';
import NodeVaultApp from './App.js';
import { enterFullscreen, leaveFullscreen } from './terminalMode.js';
import { closeDb } from '../db/database.js';

/**
 * Launch fullscreen TUI when the binary is invoked with no arguments (see bin/nodevault.js).
 * Set NODEVAULT_PLAIN=1 to force classic CLI only (e.g. CI).
 */
export function shouldLaunchTui(argv) {
  if (process.env.NODEVAULT_PLAIN === '1' || process.env.CI === 'true') {
    return false;
  }
  return argv.length === 0;
}

/** Single Ink session (Claude-style): commands run in-process via sessionRunner; no remount loop. */
export async function runTui() {
  enterFullscreen();
  try {
    const { waitUntilExit } = render(React.createElement(NodeVaultApp), {
      exitOnCtrlC: true,
      patchConsole: true,
    });
    await waitUntilExit();
  } catch (err) {
    throw err;
  } finally {
    leaveFullscreen();
    closeDb();
  }
}
