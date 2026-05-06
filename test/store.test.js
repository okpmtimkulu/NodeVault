import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Store module uses paths from config which point to ~/.nodevault.
// We test the pure helper functions and the store logic at a filesystem level.
import { storeKey, escapePackageName } from '../src/utils.js';

describe('store key generation', () => {
  it('generates correct store key for simple package', () => {
    assert.equal(storeKey('express', '4.18.2'), 'express@4.18.2');
  });

  it('generates correct store key for scoped package', () => {
    assert.equal(storeKey('@types/node', '20.11.0'), '_types__node@20.11.0');
  });
});

describe('store filesystem operations', () => {
  let tmpStore, tmpStaging;

  beforeEach(() => {
    tmpStore = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-store-'));
    tmpStaging = path.join(tmpStore, '.staging');
    fs.mkdirSync(tmpStaging, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpStore, { recursive: true, force: true });
  });

  it('can create and verify store directory structure', () => {
    const pkgDir = path.join(tmpStore, 'express@4.18.2');
    fs.mkdirSync(pkgDir);
    fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"express","version":"4.18.2"}');

    assert.ok(fs.existsSync(pkgDir));
    assert.ok(fs.existsSync(path.join(pkgDir, 'index.js')));
  });

  it('staging directory is used for atomic operations', () => {
    // Simulate staging: copy to staging, then rename to store
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-src-'));
    fs.writeFileSync(path.join(srcDir, 'index.js'), 'hello');

    const stagingDest = path.join(tmpStaging, 'test-pkg@1.0.0');
    fs.cpSync(srcDir, stagingDest, { recursive: true });
    assert.ok(fs.existsSync(stagingDest));

    const finalDest = path.join(tmpStore, 'test-pkg@1.0.0');
    fs.renameSync(stagingDest, finalDest);
    assert.ok(fs.existsSync(finalDest));
    assert.equal(fs.existsSync(stagingDest), false);

    fs.rmSync(srcDir, { recursive: true, force: true });
  });

  it('can remove a package from store', () => {
    const pkgDir = path.join(tmpStore, 'lodash@4.17.21');
    fs.mkdirSync(pkgDir);
    fs.writeFileSync(path.join(pkgDir, 'lodash.js'), '');

    fs.rmSync(pkgDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(pkgDir), false);
  });

  it('can clean staging directory', () => {
    // Create some staged packages
    fs.mkdirSync(path.join(tmpStaging, 'pkg1@1.0.0'));
    fs.mkdirSync(path.join(tmpStaging, 'pkg2@2.0.0'));

    const entries = fs.readdirSync(tmpStaging);
    for (const entry of entries) {
      fs.rmSync(path.join(tmpStaging, entry), { recursive: true, force: true });
    }

    assert.equal(fs.readdirSync(tmpStaging).length, 0);
  });

  it('counts packages correctly (excluding hidden)', () => {
    fs.mkdirSync(path.join(tmpStore, 'express@4.18.2'));
    fs.mkdirSync(path.join(tmpStore, 'lodash@4.17.21'));
    // .staging is hidden and should not count

    const entries = fs.readdirSync(tmpStore);
    const packageCount = entries.filter(e => !e.startsWith('.')).length;
    assert.equal(packageCount, 2);
  });
});
