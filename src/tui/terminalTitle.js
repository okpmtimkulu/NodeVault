/**
 * Set terminal tab/window title (OSC 0), same idea as Claude Code's useTerminalTitle.
 * Disable with NODEVAULT_DISABLE_TERMINAL_TITLE=1.
 */

const BEL = '\u0007';

/** OSC 0: set icon + window title */
function osc0(title) {
  return `\u001b]0;${title.replace(/\u0007/g, '')}${BEL}`;
}

export function setTerminalTitle(title) {
  if (process.env.NODEVAULT_DISABLE_TERMINAL_TITLE === '1') return;
  const clean = String(title).replace(/\u001b\[[0-9;]*m/g, '');
  if (process.platform === 'win32') {
    process.title = clean;
  } else {
    process.stdout.write(osc0(clean));
  }
}
