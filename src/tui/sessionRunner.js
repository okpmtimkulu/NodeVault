import * as output from '../output.js';
import { setProgressSink, clearProgressSink } from '../output.js';
import { runTuiCommand } from './dispatch.js';

/**
 * Run a vault command in-process while capturing all output for the Ink UI.
 * Patches console.log/error for the duration; restores output sink after.
 * @param {string} name
 * @param {string} args
 * @param {(line: string) => void} onLine
 * @param {((info: { message: string, current: number, total: number }) => void)|null} [onProgress]
 */
export async function runSessionCommand(name, args, onLine, onProgress) {
  const push = (line) => {
    if (line === '') {
      onLine('');
    } else {
      onLine(line);
    }
  };

  output.setOutputSink((plain) => {
    push(plain);
  });

  if (onProgress) {
    setProgressSink(onProgress);
  }

  const origLog = console.log;
  const origErr = console.error;

  console.log = (...a) => {
    const s = a.map((x) => output.stripAnsi(String(x))).join(' ');
    push(s);
  };
  console.error = (...a) => {
    const s = a.map((x) => output.stripAnsi(String(x))).join(' ');
    push(s);
  };

  try {
    await runTuiCommand(name, args, { session: true });
  } finally {
    console.log = origLog;
    console.error = origErr;
    output.stopSpinner();
    output.clearOutputSink();
    clearProgressSink();
  }
}
