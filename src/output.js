import chalk from 'chalk';
import ora from 'ora';

import { shortenPath } from './utils.js';

/** Node.js–style brand green */
export const NODE_BRAND_GREEN = '#339933';

let currentSpinner = null;

/** When set (e.g. TUI session), CLI lines are sent here instead of stdout (plain text). */
let outputSink = null;

/** Progress callback for long-running tasks (TUI subscribes to this). */
let progressSink = null;

/**
 * Set a listener for progress updates from long-running operations.
 * @param {((info: { message: string, current: number, total: number }) => void)|null} fn
 */
export function setProgressSink(fn) {
  progressSink = typeof fn === 'function' ? fn : null;
}

export function clearProgressSink() {
  progressSink = null;
}

/**
 * Emit a progress update (no-op when no sink is attached).
 * @param {string} message — e.g. "Linking express-app"
 * @param {number} current
 * @param {number} total
 */
export function emitProgress(message, current, total) {
  if (progressSink) {
    progressSink({ message, current, total });
  }
}

export function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;]*m/g, '');
}

export function setOutputSink(fn) {
  outputSink = typeof fn === 'function' ? fn : null;
}

export function clearOutputSink() {
  outputSink = null;
}

function sinkLine(line) {
  if (outputSink) {
    outputSink(stripAnsi(line));
  }
}

function emitLine(line) {
  if (outputSink) {
    sinkLine(line);
  } else {
    console.log(line);
  }
}

/** Green bullet prefix for info/task lines (Claude Code style) */
export function infoLinePrefix() {
  return chalk.hex(NODE_BRAND_GREEN)('⏺');
}


export function spinner(text) {
  if (outputSink) {
    sinkLine(`⋯ ${text}`);
    const fake = {
      succeed: (msg) => {
        sinkLine(`✓ ${msg}`);
        currentSpinner = null;
      },
      warn: (msg) => {
        sinkLine(`⚠ ${msg}`);
        currentSpinner = null;
      },
      fail: (msg) => {
        sinkLine(`✗ ${msg}`);
        currentSpinner = null;
      },
      stop: () => {
        currentSpinner = null;
      },
      stopAndPersist: ({ symbol, text: t }) => {
        sinkLine(`${symbol ?? ''} ${t}`.trim());
        currentSpinner = null;
      },
      info: (msg) => {
        sinkLine(`ℹ ${msg}`);
        currentSpinner = null;
      },
    };
    currentSpinner = /** @type {any} */ (fake);
    return /** @type {any} */ (fake);
  }
  currentSpinner = ora({ text, color: 'green' }).start();
  return currentSpinner;
}

export function stopSpinner() {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

export function success(msg) {
  if (currentSpinner) {
    currentSpinner.succeed(msg);
    currentSpinner = null;
  } else {
    emitLine(chalk.green('✓') + ' ' + msg);
  }
}

export function warn(msg) {
  if (currentSpinner) {
    currentSpinner.warn(msg);
    currentSpinner = null;
  } else {
    emitLine(chalk.yellow('⚠') + ' ' + msg);
  }
}

export function error(msg) {
  if (currentSpinner) {
    currentSpinner.fail(msg);
    currentSpinner = null;
  } else if (outputSink) {
    sinkLine(chalk.red('✗') + ' ' + msg);
  } else {
    console.error(chalk.red('✗') + ' ' + msg);
  }
}

export function info(msg) {
  const prefix = infoLinePrefix();
  if (currentSpinner) {
    currentSpinner.stopAndPersist({ symbol: prefix, text: msg });
    currentSpinner = null;
  } else {
    emitLine(prefix + ' ' + msg);
  }
}

export function heading(msg) {
  emitLine('\n' + chalk.bold.cyan(msg));
}

export function dim(msg) {
  emitLine(chalk.dim(msg));
}

export function table(headers, rows) {
  const termWidth = Math.max(
    40,
    (typeof process !== 'undefined' && process.stdout?.columns) ? process.stdout.columns : 80,
  );
  const pathIdx = headers.indexOf('Path');
  const gap = 2;
  const margin = 4;

  function measureRows(pathMax) {
    if (pathIdx < 0) return rows;
    return rows.map((r) => {
      const copy = [...r];
      copy[pathIdx] = shortenPath(String(r[pathIdx] ?? ''), pathMax);
      return copy;
    });
  }

  function colWidths(prepared) {
    return headers.map((h, i) =>
      Math.max(
        h.length,
        prepared.reduce((m, row) => Math.max(m, String(row[i] ?? '').length), 0),
      ),
    );
  }

  let pathMax = Math.min(120, termWidth - margin);
  let prepared = measureRows(pathMax);
  let widths = colWidths(prepared);
  let total = widths.reduce((a, b) => a + b, 0) + gap * (headers.length - 1);

  while (total > termWidth - margin && pathIdx >= 0 && pathMax > 10) {
    pathMax -= 3;
    prepared = measureRows(pathMax);
    widths = colWidths(prepared);
    total = widths.reduce((a, b) => a + b, 0) + gap * (headers.length - 1);
  }

  const headerLine = headers.map((h, i) => chalk.bold(h.padEnd(widths[i]))).join('  ');
  const separator = widths.map((w) => '─'.repeat(w)).join('──');

  emitLine('  ' + headerLine);
  emitLine('  ' + chalk.dim(separator));

  for (const row of prepared) {
    const line = row
      .map((cell, i) => {
        const str = String(cell ?? '');
        return str.padEnd(widths[i]);
      })
      .join('  ');
    emitLine('  ' + line);
  }
}

export function statusBadge(status) {
  switch (status) {
    case 'active': return chalk.green(status);
    case 'stale': return chalk.yellow(status);
    case 'archived': return chalk.red(status);
    case 'linked': return chalk.cyan(status);
    default: return status;
  }
}

export function sizeBadge(bytes, threshold) {
  if (bytes === 0) return chalk.dim('0 B');
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  const str = `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  if (bytes > (threshold || 500 * 1024 * 1024)) return chalk.red(str);
  if (bytes > (threshold || 200 * 1024 * 1024)) return chalk.yellow(str);
  return str;
}
