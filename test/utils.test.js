import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  formatBytes,
  shortenPath,
  truncateLine,
  isCrossFilesystem,
  dirSize,
  rmrf,
  copyRecursive,
  hasNativeBindings,
  detectPackageManager,
  isPnpmVirtualStore,
  escapePackageName,
  storeKey,
  daysAgo,
  relativeTime,
} from '../src/utils.js';

// ─── formatBytes ───

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    assert.equal(formatBytes(0), '0 B');
  });

  it('formats bytes', () => {
    assert.equal(formatBytes(512), '512 B');
  });

  it('formats kilobytes', () => {
    assert.equal(formatBytes(1024), '1.0 KB');
  });

  it('formats megabytes', () => {
    assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  });

  it('formats gigabytes', () => {
    assert.equal(formatBytes(1024 ** 3), '1.0 GB');
  });

  it('formats fractional values', () => {
    assert.equal(formatBytes(1536), '1.5 KB');
  });
});

// ─── shortenPath ───

describe('shortenPath', () => {
  const home = os.homedir();

  it('replaces home dir with ~', () => {
    const result = shortenPath(path.join(home, 'projects', 'app'));
    assert.ok(result.startsWith('~'));
  });

  it('truncates with ellipsis when too long', () => {
    const longPath = path.join(home, 'a'.repeat(100));
    const result = shortenPath(longPath, 20);
    assert.ok(result.length <= 20);
    assert.ok(result.includes('…'));
  });

  it('returns path unchanged when under maxLen', () => {
    const short = '/tmp/x';
    assert.equal(shortenPath(short, 100), short);
  });

  it('handles very small maxLen', () => {
    const result = shortenPath('/some/long/path', 5);
    assert.ok(result.length <= 5);
  });
});

// ─── truncateLine ───

describe('truncateLine', () => {
  it('returns short strings unchanged', () => {
    assert.equal(truncateLine('hello', 10), 'hello');
  });

  it('truncates with ellipsis', () => {
    const result = truncateLine('hello world', 8);
    assert.ok(result.length <= 8);
    assert.ok(result.endsWith('…'));
  });

  it('handles maxLen < 2', () => {
    assert.equal(truncateLine('abc', 1), 'a');
  });
});

// ─── dirSize ───

describe('dirSize', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 0 for empty dir', () => {
    assert.equal(dirSize(tmpDir), 0);
  });

  it('sums file sizes recursively', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello'); // 5 bytes
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'b.txt'), 'world!'); // 6 bytes
    const size = dirSize(tmpDir);
    assert.equal(size, 11);
  });

  it('returns 0 for non-existent dir', () => {
    assert.equal(dirSize('/tmp/does-not-exist-nodevault'), 0);
  });
});

// ─── rmrf ───

describe('rmrf', () => {
  it('removes a directory recursively', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-rmrf-'));
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'data');
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'nested.txt'), 'data');

    rmrf(tmpDir);
    assert.equal(fs.existsSync(tmpDir), false);
  });

  it('does not throw for non-existent path', () => {
    assert.doesNotThrow(() => rmrf('/tmp/does-not-exist-nodevault'));
  });
});

// ─── copyRecursive ───

describe('copyRecursive', () => {
  let src, dest;

  beforeEach(() => {
    src = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-cpsrc-'));
    dest = path.join(os.tmpdir(), `nv-cpdst-${Date.now()}`);
  });

  afterEach(() => {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dest, { recursive: true, force: true });
  });

  it('copies directory structure', () => {
    fs.writeFileSync(path.join(src, 'a.txt'), 'hello');
    fs.mkdirSync(path.join(src, 'sub'));
    fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'world');

    copyRecursive(src, dest);

    assert.equal(fs.readFileSync(path.join(dest, 'a.txt'), 'utf-8'), 'hello');
    assert.equal(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf-8'), 'world');
  });
});

// ─── hasNativeBindings ───

describe('hasNativeBindings', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-native-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false for dir with no .node files', () => {
    fs.writeFileSync(path.join(tmpDir, 'index.js'), '');
    assert.equal(hasNativeBindings(tmpDir), false);
  });

  it('returns true for dir with .node file', () => {
    fs.writeFileSync(path.join(tmpDir, 'binding.node'), '');
    assert.equal(hasNativeBindings(tmpDir), true);
  });

  it('returns true for nested .node file', () => {
    fs.mkdirSync(path.join(tmpDir, 'build'));
    fs.writeFileSync(path.join(tmpDir, 'build', 'addon.node'), '');
    assert.equal(hasNativeBindings(tmpDir), true);
  });
});

// ─── detectPackageManager ───

describe('detectPackageManager', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-pm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects pnpm', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    assert.equal(detectPackageManager(tmpDir), 'pnpm');
  });

  it('detects yarn', () => {
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');
    assert.equal(detectPackageManager(tmpDir), 'yarn');
  });

  it('defaults to npm', () => {
    assert.equal(detectPackageManager(tmpDir), 'npm');
  });

  it('prefers pnpm over yarn when both exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');
    assert.equal(detectPackageManager(tmpDir), 'pnpm');
  });
});

// ─── isPnpmVirtualStore ───

describe('isPnpmVirtualStore', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-pnpm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when no .pnpm dir', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
    assert.equal(isPnpmVirtualStore(tmpDir), false);
  });

  it('returns true when .pnpm dir exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', '.pnpm'), { recursive: true });
    assert.equal(isPnpmVirtualStore(tmpDir), true);
  });
});

// ─── escapePackageName / storeKey ───

describe('escapePackageName', () => {
  it('returns simple names unchanged', () => {
    assert.equal(escapePackageName('express'), 'express');
  });

  it('escapes scoped packages', () => {
    assert.equal(escapePackageName('@tanstack/react-query'), '_tanstack__react-query');
  });
});

describe('storeKey', () => {
  it('returns name@version', () => {
    assert.equal(storeKey('express', '4.18.2'), 'express@4.18.2');
  });

  it('escapes scoped packages in key', () => {
    assert.equal(storeKey('@babel/core', '7.24.0'), '_babel__core@7.24.0');
  });
});

// ─── daysAgo / relativeTime ───

describe('daysAgo', () => {
  it('returns 0 for current timestamp', () => {
    assert.equal(daysAgo(Date.now()), 0);
  });

  it('returns correct days for past timestamp', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    assert.equal(daysAgo(twoDaysAgo), 2);
  });
});

describe('relativeTime', () => {
  it('returns "today" for now', () => {
    assert.equal(relativeTime(Date.now()), 'today');
  });

  it('returns "yesterday" for 1 day ago', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    assert.equal(relativeTime(yesterday), 'yesterday');
  });

  it('returns "Xd ago" for recent days', () => {
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    assert.equal(relativeTime(fiveDaysAgo), '5d ago');
  });

  it('returns "Xmo ago" for months', () => {
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    assert.equal(relativeTime(sixtyDaysAgo), '2mo ago');
  });

  it('returns "Xy ago" for years', () => {
    const twoYearsAgo = Date.now() - 730 * 24 * 60 * 60 * 1000;
    assert.equal(relativeTime(twoYearsAgo), '2y ago');
  });

  it('accepts Date objects', () => {
    assert.equal(relativeTime(new Date()), 'today');
  });
});

// ─── isCrossFilesystem ───

describe('isCrossFilesystem', () => {
  it('returns false for same filesystem paths', () => {
    assert.equal(isCrossFilesystem(os.tmpdir(), os.homedir()), false);
  });

  it('returns false when paths do not exist', () => {
    assert.equal(isCrossFilesystem('/nonexistent1', '/nonexistent2'), false);
  });
});
