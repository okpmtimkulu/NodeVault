/**
 * Coverage-gap tests — exercises code paths missed by existing tests.
 *
 * Areas covered:
 *   • linker   – rollback, symlink skip, unlinkPackageFromProject
 *   • scanner  – ignoreDirs config, symlink traversal skip, bad JSON fallback
 *   • config   – malformed JSON fallback, saveConfig round-trip, configExists
 *   • store    – addToStore idempotency, removeFromStore, getStorePackageCount
 *   • utils    – formatBytes large values, dirSize with symlinks
 *   • lifecycle – threshold boundaries (29/30/90 days)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { linkPackageToProject, unlinkPackageFromProject } from '../src/core/linker.js';
import { scanDirectory } from '../src/core/scanner.js';
import { loadConfig, saveConfig, configExists, paths } from '../src/config.js';
import {
  ensureStoreExists,
  addToStore,
  removeFromStore,
  packageExistsInStore,
  getStorePackageCount,
  cleanStaging,
} from '../src/core/store.js';
import { formatBytes, dirSize } from '../src/utils.js';
import { classifyProject } from '../src/core/lifecycle.js';
import { closeDb } from '../src/db/database.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Swap NODEVAULT_HOME to an isolated temp dir; returns a restore function.
function isolateHome(tmpRoot) {
  const prev = process.env.NODEVAULT_HOME;
  process.env.NODEVAULT_HOME = tmpRoot;
  return () => {
    if (prev === undefined) delete process.env.NODEVAULT_HOME;
    else process.env.NODEVAULT_HOME = prev;
  };
}

// ─── linker – linkPackageToProject ───────────────────────────────────────────

describe('linkPackageToProject – rollback on failure', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmp('nv-link-rb-');
  });

  afterEach(() => {
    rmTmp(tmpDir);
  });

  it('restores original package when phase-2 throws', () => {
    const nodeModules = path.join(tmpDir, 'node_modules');
    const original = path.join(nodeModules, 'lodash');
    fs.mkdirSync(original, { recursive: true });
    fs.writeFileSync(path.join(original, 'index.js'), 'original content');

    // Pass a storePath that does not exist — hardlinkRecursive will throw ENOENT
    const fakeStore = path.join(tmpDir, 'nonexistent-store', 'lodash@4.17.21');

    assert.throws(
      () => linkPackageToProject(fakeStore, nodeModules, 'lodash', 'hardlink'),
      /ENOENT/,
    );

    // Original must be restored after rollback
    assert.ok(fs.existsSync(original), 'original directory should exist after rollback');
    assert.equal(
      fs.readFileSync(path.join(original, 'index.js'), 'utf-8'),
      'original content',
      'original content should be intact',
    );
  });

  it('links fresh target (no pre-existing package) without error', () => {
    const storePkg = path.join(tmpDir, 'store', 'fresh-pkg@1.0.0');
    fs.mkdirSync(storePkg, { recursive: true });
    fs.writeFileSync(path.join(storePkg, 'index.js'), 'fresh');

    const nodeModules = path.join(tmpDir, 'project', 'node_modules');
    fs.mkdirSync(nodeModules, { recursive: true });

    linkPackageToProject(storePkg, nodeModules, 'fresh-pkg', 'copy');

    assert.equal(
      fs.readFileSync(path.join(nodeModules, 'fresh-pkg', 'index.js'), 'utf-8'),
      'fresh',
    );
  });

  it('hardlinkRecursive skips symlinks (does not throw, symlink not copied to dest)', () => {
    const storePkg = path.join(tmpDir, 'store', 'withsym@1.0.0');
    fs.mkdirSync(storePkg, { recursive: true });
    fs.writeFileSync(path.join(storePkg, 'real.js'), 'real');
    // Create a symlink inside the store package
    const symlinkTarget = path.join(tmpDir, 'external.js');
    fs.writeFileSync(symlinkTarget, 'external');
    fs.symlinkSync(symlinkTarget, path.join(storePkg, 'linked.js'));

    const nodeModules = path.join(tmpDir, 'proj', 'node_modules');
    fs.mkdirSync(nodeModules, { recursive: true });

    // Should not throw even though a symlink is present in the store package
    assert.doesNotThrow(() => linkPackageToProject(storePkg, nodeModules, 'withsym', 'hardlink'));

    // real.js should be hardlinked; symlink should be skipped
    assert.ok(fs.existsSync(path.join(nodeModules, 'withsym', 'real.js')));
    assert.equal(fs.existsSync(path.join(nodeModules, 'withsym', 'linked.js')), false);
  });

  it('cleans up .nodevault-tmp when empty after successful link', () => {
    const storePkg = path.join(tmpDir, 'store', 'pkg@1.0.0');
    fs.mkdirSync(storePkg, { recursive: true });
    fs.writeFileSync(path.join(storePkg, 'index.js'), 'content');

    const nodeModules = path.join(tmpDir, 'myproject', 'node_modules');
    const existingPkg = path.join(nodeModules, 'pkg');
    fs.mkdirSync(existingPkg, { recursive: true });
    fs.writeFileSync(path.join(existingPkg, 'index.js'), 'old');

    linkPackageToProject(storePkg, nodeModules, 'pkg', 'copy');

    // .nodevault-tmp should be cleaned up
    const tmpBackup = path.join(nodeModules, '.nodevault-tmp');
    assert.equal(fs.existsSync(tmpBackup), false, '.nodevault-tmp should be removed after success');
  });
});

// ─── linker – unlinkPackageFromProject ───────────────────────────────────────

describe('unlinkPackageFromProject', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmp('nv-unlink-');
  });

  afterEach(() => {
    rmTmp(tmpDir);
  });

  it('is a no-op when target does not exist', () => {
    const storePkg = path.join(tmpDir, 'store', 'missing@1.0.0');
    fs.mkdirSync(storePkg, { recursive: true });
    fs.writeFileSync(path.join(storePkg, 'index.js'), 'content');

    const nodeModules = path.join(tmpDir, 'project', 'node_modules');
    fs.mkdirSync(nodeModules, { recursive: true });

    // target (node_modules/missing) does not exist — should not throw
    assert.doesNotThrow(() => unlinkPackageFromProject(storePkg, nodeModules, 'missing'));
  });

  it('replaces target with a fresh copy from store', () => {
    const storePkg = path.join(tmpDir, 'store', 'react@18.2.0');
    fs.mkdirSync(storePkg, { recursive: true });
    fs.writeFileSync(path.join(storePkg, 'index.js'), 'store-react');

    const nodeModules = path.join(tmpDir, 'project', 'node_modules');
    const targetPkg = path.join(nodeModules, 'react');
    fs.mkdirSync(targetPkg, { recursive: true });
    fs.writeFileSync(path.join(targetPkg, 'index.js'), 'old-linked-react');

    unlinkPackageFromProject(storePkg, nodeModules, 'react');

    assert.equal(
      fs.readFileSync(path.join(nodeModules, 'react', 'index.js'), 'utf-8'),
      'store-react',
    );
    // Must be an independent copy (different inode from store)
    const storeStat = fs.statSync(path.join(storePkg, 'index.js'));
    const projStat = fs.statSync(path.join(nodeModules, 'react', 'index.js'));
    assert.notEqual(storeStat.ino, projStat.ino);
  });
});

// ─── scanner – extra edge cases ──────────────────────────────────────────────

describe('scanDirectory – extra edge cases', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmp('nv-scan2-');
  });

  afterEach(() => {
    rmTmp(tmpDir);
  });

  it('skips symlinks to directories during traversal (no infinite loop)', () => {
    const realDir = path.join(tmpDir, 'real-app');
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(path.join(realDir, 'package.json'), '{"name":"real-app","version":"1.0.0"}');
    fs.mkdirSync(path.join(realDir, 'node_modules'));
    const now = new Date();
    fs.utimesSync(path.join(realDir, 'package.json'), now, now);

    // Symlink pointing back at tmpDir — would loop forever if followed
    fs.symlinkSync(tmpDir, path.join(tmpDir, 'loop-link'));

    const projects = scanDirectory(tmpDir, { depth: 4 });
    const names = projects.map((p) => p.name);
    assert.ok(names.includes('real-app'));
    assert.equal(names.includes('loop-link'), false);
  });

  it('ignoreDirs config excludes matching directory names', () => {
    // dist is in the default ignoreDirs list
    const distApp = path.join(tmpDir, 'dist', 'dist-app');
    fs.mkdirSync(distApp, { recursive: true });
    fs.writeFileSync(path.join(distApp, 'package.json'), '{"name":"dist-app","version":"1.0.0"}');
    fs.mkdirSync(path.join(distApp, 'node_modules'));

    const rootApp = path.join(tmpDir, 'root-app');
    fs.mkdirSync(rootApp, { recursive: true });
    fs.writeFileSync(path.join(rootApp, 'package.json'), '{"name":"root-app","version":"1.0.0"}');
    fs.mkdirSync(path.join(rootApp, 'node_modules'));
    const now = new Date();
    fs.utimesSync(path.join(rootApp, 'package.json'), now, now);

    const projects = scanDirectory(tmpDir, { depth: 6 });
    const names = projects.map((p) => p.name);
    assert.ok(names.includes('root-app'));
    assert.equal(names.includes('dist-app'), false, 'dist-app inside dist/ should be skipped');
  });

  it('handles malformed package.json (falls back to directory name)', () => {
    const dir = path.join(tmpDir, 'broken-json-app');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{ this is not valid json }');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    const now = new Date();
    fs.utimesSync(path.join(dir, 'package.json'), now, now);

    const projects = scanDirectory(tmpDir, { depth: 4 });
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'broken-json-app');
  });
});

// ─── config – loadConfig / saveConfig / configExists ─────────────────────────

describe('loadConfig – malformed JSON fallback', () => {
  let tmpRoot, restoreHome;

  beforeEach(() => {
    tmpRoot = makeTmp('nv-cfg-');
    restoreHome = isolateHome(tmpRoot);
  });

  afterEach(() => {
    closeDb();
    restoreHome();
    rmTmp(tmpRoot);
  });

  it('uses defaults when config.json is malformed', () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'config.json'), '{ bad json }');

    const cfg = loadConfig();
    assert.equal(cfg.linkStrategy, 'hardlink');
    assert.equal(cfg.scanDepth, 4);
    assert.equal(cfg.staleThresholdDays, 30);
  });

  it('merges user config values over defaults', () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'config.json'),
      JSON.stringify({ scanDepth: 8, linkStrategy: 'copy' }),
    );

    const cfg = loadConfig();
    assert.equal(cfg.scanDepth, 8);
    assert.equal(cfg.linkStrategy, 'copy');
    assert.equal(cfg.staleThresholdDays, 30); // default still present
  });

  it('expands ~ in storePath from config file', () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'config.json'),
      JSON.stringify({ storePath: '~/my-custom-store' }),
    );

    const cfg = loadConfig();
    assert.ok(cfg.storePath.startsWith(os.homedir()));
    assert.ok(cfg.storePath.endsWith('my-custom-store'));
  });

  it('expands ~ in watchDirs from config file', () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'config.json'),
      JSON.stringify({ watchDirs: ['~/projects', '~/work'] }),
    );

    const cfg = loadConfig();
    assert.ok(cfg.watchDirs.every((d) => d.startsWith(os.homedir())));
  });
});

describe('saveConfig + configExists', () => {
  let tmpRoot, restoreHome;

  beforeEach(() => {
    tmpRoot = makeTmp('nv-cfgsave-');
    restoreHome = isolateHome(tmpRoot);
  });

  afterEach(() => {
    closeDb();
    restoreHome();
    rmTmp(tmpRoot);
  });

  it('configExists returns false before any config is written', () => {
    assert.equal(configExists(), false);
  });

  it('saveConfig writes config and configExists returns true', () => {
    const defaults = loadConfig();
    saveConfig(defaults);
    assert.equal(configExists(), true);
  });

  it('saveConfig round-trips linkStrategy', () => {
    const cfg = loadConfig();
    cfg.linkStrategy = 'copy';
    saveConfig(cfg);

    const loaded = loadConfig();
    assert.equal(loaded.linkStrategy, 'copy');
  });

  it('saveConfig stores storePath with ~ when storePath is inside home dir', () => {
    const cfg = loadConfig();
    // Override storePath to something inside the home dir
    cfg.storePath = path.join(os.homedir(), '.nodevault-test-store');
    saveConfig(cfg);

    const raw = JSON.parse(fs.readFileSync(path.join(tmpRoot, 'config.json'), 'utf-8'));
    assert.ok(raw.storePath.startsWith('~'), `expected ~ prefix, got: ${raw.storePath}`);
  });
});

// ─── store – addToStore, removeFromStore, getStorePackageCount ────────────────

describe('store operations (isolated NODEVAULT_HOME)', () => {
  let tmpRoot, restoreHome, srcPkg;

  beforeEach(() => {
    tmpRoot = makeTmp('nv-storeops-');
    restoreHome = isolateHome(tmpRoot);

    // Dummy source package to add to the store
    srcPkg = makeTmp('nv-srcpkg-');
    fs.writeFileSync(path.join(srcPkg, 'index.js'), 'hello');
    fs.writeFileSync(path.join(srcPkg, 'package.json'), '{"name":"testpkg","version":"1.0.0"}');
  });

  afterEach(() => {
    closeDb();
    restoreHome();
    rmTmp(tmpRoot);
    rmTmp(srcPkg);
  });

  it('addToStore copies package and returns storePath', () => {
    ensureStoreExists();
    const result = addToStore('testpkg', '1.0.0', srcPkg);
    assert.ok(fs.existsSync(result.storePath));
    assert.equal(result.alreadyExisted, false);
    assert.equal(
      fs.readFileSync(path.join(result.storePath, 'index.js'), 'utf-8'),
      'hello',
    );
  });

  it('addToStore is idempotent (returns alreadyExisted=true on second call)', () => {
    ensureStoreExists();
    addToStore('testpkg', '1.0.0', srcPkg);
    const result2 = addToStore('testpkg', '1.0.0', srcPkg);
    assert.equal(result2.alreadyExisted, true);
  });

  it('packageExistsInStore returns false before adding', () => {
    ensureStoreExists();
    assert.equal(packageExistsInStore('testpkg', '1.0.0'), false);
  });

  it('packageExistsInStore returns true after adding', () => {
    ensureStoreExists();
    addToStore('testpkg', '1.0.0', srcPkg);
    assert.equal(packageExistsInStore('testpkg', '1.0.0'), true);
  });

  it('removeFromStore deletes the package from store', () => {
    ensureStoreExists();
    const { storePath } = addToStore('testpkg', '1.0.0', srcPkg);
    assert.ok(fs.existsSync(storePath));
    removeFromStore('testpkg', '1.0.0');
    assert.equal(fs.existsSync(storePath), false);
  });

  it('removeFromStore does not throw when package does not exist', () => {
    ensureStoreExists();
    assert.doesNotThrow(() => removeFromStore('ghost', '9.9.9'));
  });

  it('getStorePackageCount excludes .staging and other hidden dirs', () => {
    ensureStoreExists();
    addToStore('pkgA', '1.0.0', srcPkg);
    addToStore('pkgB', '2.0.0', srcPkg);
    // .staging already exists; add a fake hidden dir to verify it is excluded
    fs.mkdirSync(path.join(paths.storePath, '.DS_Store'), { recursive: true });

    const count = getStorePackageCount();
    assert.equal(count, 2);
  });

  it('cleanStaging empties the staging directory', () => {
    ensureStoreExists();
    fs.mkdirSync(path.join(paths.stagingPath, 'leftover@1.0.0'), { recursive: true });

    cleanStaging();

    const remaining = fs.readdirSync(paths.stagingPath);
    assert.equal(remaining.length, 0);
  });
});

// ─── utils – formatBytes edge cases & dirSize with symlinks ──────────────────

describe('formatBytes – edge cases', () => {
  it('formats terabytes', () => {
    const result = formatBytes(1024 ** 4);
    assert.ok(result.endsWith('TB'), `expected TB suffix, got: ${result}`);
    assert.ok(result.startsWith('1.0'));
  });

  it('handles 1023 bytes (just below 1 KB)', () => {
    assert.equal(formatBytes(1023), '1023 B');
  });

  it('formats fractional GB', () => {
    const result = formatBytes(1.5 * 1024 ** 3);
    assert.equal(result, '1.5 GB');
  });
});

describe('dirSize – symlink handling', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmp('nv-dsize-');
  });

  afterEach(() => {
    rmTmp(tmpDir);
  });

  it('does not follow symlinks to directories (avoids double-counting)', () => {
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'file.txt'), 'hello'); // 5 bytes

    // Symlink from tmpDir that points at subDir — should not be traversed
    fs.symlinkSync(subDir, path.join(tmpDir, 'link-to-sub'));

    const size = dirSize(tmpDir);
    assert.equal(size, 5, 'symlinked directory should not be traversed');
  });

  it('counts files directly under the root dir', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), '12345'); // 5 bytes
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), '123');   // 3 bytes
    assert.equal(dirSize(tmpDir), 8);
  });
});

// ─── lifecycle – threshold boundary tests ────────────────────────────────────

describe('classifyProject – threshold boundaries', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmp('nv-lc-bnd-');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
  });

  afterEach(() => {
    rmTmp(tmpDir);
  });

  function setMtime(days) {
    const t = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(tmpDir, 'package.json'), t, t);
  }

  it('29 days old → active (below stale threshold)', () => {
    setMtime(29);
    assert.equal(classifyProject(tmpDir, null), 'active');
  });

  it('30 days old → stale (at stale threshold)', () => {
    setMtime(30);
    assert.equal(classifyProject(tmpDir, null), 'stale');
  });

  it('89 days old → stale (below archive threshold)', () => {
    setMtime(89);
    assert.equal(classifyProject(tmpDir, null), 'stale');
  });

  it('90 days old → archived (at archive threshold)', () => {
    setMtime(90);
    assert.equal(classifyProject(tmpDir, null), 'archived');
  });

  it('no file system signals at all → archived', () => {
    fs.unlinkSync(path.join(tmpDir, 'package.json'));
    assert.equal(classifyProject(tmpDir, null), 'archived');
  });

  it('symlinks in src/ are skipped — stale package.json remains stale', () => {
    setMtime(50); // stale

    fs.mkdirSync(path.join(tmpDir, 'src'));
    const externalFile = path.join(tmpDir, 'external.js');
    fs.writeFileSync(externalFile, ''); // fresh mtime
    // Symlink inside src/ — should be skipped by findNewestFile
    fs.symlinkSync(externalFile, path.join(tmpDir, 'src', 'linked.js'));

    assert.equal(
      classifyProject(tmpDir, null),
      'stale',
      'symlinks in src/ should not upgrade the project status',
    );
  });

  it('db record last_scanned_at overrides stale package.json', () => {
    setMtime(50); // would be stale without DB record
    const dbRecord = { last_scanned_at: Math.floor(Date.now() / 1000) };
    assert.equal(classifyProject(tmpDir, dbRecord), 'active');
  });
});
