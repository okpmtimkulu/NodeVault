import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { acquireLock } from '../src/core/lock.js';

describe('acquireLock (NODEVAULT_HOME)', () => {
  let tmpRoot;
  let prevHome;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-lock-acq-'));
    prevHome = process.env.NODEVAULT_HOME;
    process.env.NODEVAULT_HOME = tmpRoot;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.NODEVAULT_HOME;
    else process.env.NODEVAULT_HOME = prevHome;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('creates and releases lock under isolated root', () => {
    const lockPath = path.join(tmpRoot, 'operations.lock');
    const lock = acquireLock();
    assert.ok(fs.existsSync(lockPath));
    lock.release();
    assert.equal(fs.existsSync(lockPath), false);
  });

  it('throws when lock is held by live process', () => {
    const lock = acquireLock();
    try {
      assert.throws(() => acquireLock(), /Another nodevault operation/);
    } finally {
      lock.release();
    }
  });
});
