import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { expandPath, getNodevaultRoot, getPaths, paths } from '../src/config.js';

describe('NODEVAULT_HOME / paths', () => {
  let prev;

  beforeEach(() => {
    prev = process.env.NODEVAULT_HOME;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.NODEVAULT_HOME;
    else process.env.NODEVAULT_HOME = prev;
  });

  it('getNodevaultRoot uses NODEVAULT_HOME when set', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-home-'));
    try {
      process.env.NODEVAULT_HOME = tmp;
      assert.equal(getNodevaultRoot(), path.resolve(tmp));
      assert.equal(paths.configPath, path.join(path.resolve(tmp), 'config.json'));
      assert.equal(paths.dbPath, path.join(path.resolve(tmp), 'vault.db'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('empty NODEVAULT_HOME falls back to ~/.nodevault', () => {
    process.env.NODEVAULT_HOME = '   ';
    assert.equal(getNodevaultRoot(), path.join(os.homedir(), '.nodevault'));
  });

  it('getPaths returns consistent keys', () => {
    const p = getPaths();
    assert.ok(p.nodevaultDir);
    assert.ok(p.storePath);
    assert.ok(p.stagingPath);
    assert.equal(p.stagingPath, path.join(p.storePath, '.staging'));
  });
});

describe('expandPath', () => {
  it('expands ~ to home dir', () => {
    const result = expandPath('~/projects');
    assert.equal(result, path.join(os.homedir(), 'projects'));
  });

  it('expands bare ~', () => {
    const result = expandPath('~');
    assert.equal(result, os.homedir());
  });

  it('resolves relative paths', () => {
    const result = expandPath('.');
    assert.equal(result, process.cwd());
  });

  it('returns absolute paths unchanged', () => {
    const result = expandPath('/tmp/test');
    assert.equal(result, '/tmp/test');
  });
});
