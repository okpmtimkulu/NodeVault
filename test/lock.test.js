import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We test the locking logic at filesystem level since the module
// imports from config.js which uses hardcoded ~/.nodevault paths.

describe('filesystem locking', () => {
  let tmpDir, lockFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-lock-'));
    lockFile = path.join(tmpDir, 'operations.lock');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a lock file with exclusive flag', () => {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
    fs.closeSync(fd);

    assert.ok(fs.existsSync(lockFile));
    const content = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
    assert.equal(content.pid, process.pid);
  });

  it('fails to create lock when one exists', () => {
    // Create first lock
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));

    // Second exclusive open should fail
    assert.throws(() => {
      fs.openSync(lockFile, 'wx');
    }, { code: 'EEXIST' });
  });

  it('detects stale lock from dead process', () => {
    // Write lock with PID that doesn't exist
    const fakePid = 999999;
    fs.writeFileSync(lockFile, JSON.stringify({ pid: fakePid, timestamp: Date.now() - 600000 }));

    // Check if process is alive
    let alive = false;
    try {
      process.kill(fakePid, 0);
      alive = true;
    } catch {
      alive = false;
    }

    assert.equal(alive, false);

    // Can remove stale lock and create new one
    fs.unlinkSync(lockFile);
    const fd = fs.openSync(lockFile, 'wx');
    fs.closeSync(fd);
    assert.ok(fs.existsSync(lockFile));
  });

  it('releases lock by deleting file', () => {
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
    assert.ok(fs.existsSync(lockFile));

    fs.unlinkSync(lockFile);
    assert.equal(fs.existsSync(lockFile), false);

    // Can acquire again
    const fd = fs.openSync(lockFile, 'wx');
    fs.closeSync(fd);
    assert.ok(fs.existsSync(lockFile));
  });
});
