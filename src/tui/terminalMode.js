/** Alternate screen buffer: isolates the TUI from shell scrollback (vim-style). */
const ENTER_ALT = '\u001b[?1049h';
const LEAVE_ALT = '\u001b[?1049l';
const HOME = '\u001b[H';
const CLEAR_SCREEN = '\u001b[2J';

export function enterFullscreen() {
  process.stdout.write(ENTER_ALT + HOME + CLEAR_SCREEN);
}

export function leaveFullscreen() {
  process.stdout.write(LEAVE_ALT);
}
