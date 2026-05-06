import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { shouldLaunchTui } from '../src/tui/index.js';
import { runTuiCommand } from '../src/tui/dispatch.js';
import { SLASH_COMMANDS, filterSlashCommands } from '../src/tui/slashCommands.js';
import { closeDb } from '../src/db/database.js';
import * as output from '../src/output.js';

describe('shouldLaunchTui', () => {
  let prevPlain;
  let prevCi;

  beforeEach(() => {
    prevPlain = process.env.NODEVAULT_PLAIN;
    prevCi = process.env.CI;
  });

  afterEach(() => {
    if (prevPlain === undefined) delete process.env.NODEVAULT_PLAIN;
    else process.env.NODEVAULT_PLAIN = prevPlain;
    if (prevCi === undefined) delete process.env.CI;
    else process.env.CI = prevCi;
  });

  it('launches TUI when argv is empty and not plain/CI', () => {
    delete process.env.NODEVAULT_PLAIN;
    delete process.env.CI;
    assert.equal(shouldLaunchTui([]), true);
  });

  it('does not launch when NODEVAULT_PLAIN=1', () => {
    process.env.NODEVAULT_PLAIN = '1';
    assert.equal(shouldLaunchTui([]), false);
  });

  it('does not launch when CI=true', () => {
    process.env.CI = 'true';
    assert.equal(shouldLaunchTui([]), false);
  });

  it('does not launch when args present', () => {
    assert.equal(shouldLaunchTui(['status']), false);
  });
});

describe('filterSlashCommands', () => {
  it('returns empty when line does not start with /', () => {
    assert.deepEqual(filterSlashCommands('hello'), []);
  });

  it('filters by token after slash', () => {
    const r = filterSlashCommands('/li');
    assert.ok(r.length >= 1);
    assert.ok(r.every((c) => c.name.startsWith('li')));
  });
});

describe('SLASH_COMMANDS', () => {
  it('has unique names', () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('runTuiCommand', () => {
  let tmpRoot;
  let prevHome;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-tui-'));
    prevHome = process.env.NODEVAULT_HOME;
    process.env.NODEVAULT_HOME = tmpRoot;
  });

  afterEach(() => {
    closeDb();
    if (prevHome === undefined) delete process.env.NODEVAULT_HOME;
    else process.env.NODEVAULT_HOME = prevHome;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('init via dispatch initializes vault', async () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      await runTuiCommand('init', '', {});
    } finally {
      output.clearOutputSink();
    }
    assert.ok(fs.existsSync(path.join(tmpRoot, 'config.json')));
    assert.ok(lines.length > 0 || fs.existsSync(path.join(tmpRoot, 'vault.db')));
  });

  it('link without path warns', async () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      await runTuiCommand('link', '', {});
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('Specify') || l.includes('path')));
  });

  it('unknown command errors', async () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      await runTuiCommand('not-a-real-command', '', {});
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('Unknown command')));
  });
});
