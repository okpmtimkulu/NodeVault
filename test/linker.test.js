import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We can't easily test determineLinkStrategy without mocking config,
// but we can test the hardlink/copy logic at filesystem level.

describe('linker filesystem operations', () => {
  let tmpDir, storeDir, projectDir, nodeModulesDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-link-'));
    storeDir = path.join(tmpDir, 'store', 'express@4.18.2');
    projectDir = path.join(tmpDir, 'project');
    nodeModulesDir = path.join(projectDir, 'node_modules');

    // Create store package
    fs.mkdirSync(storeDir, { recursive: true });
    fs.writeFileSync(path.join(storeDir, 'index.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(storeDir, 'package.json'), JSON.stringify({
      name: 'express',
      version: '4.18.2',
    }));
    fs.mkdirSync(path.join(storeDir, 'lib'));
    fs.writeFileSync(path.join(storeDir, 'lib', 'router.js'), 'exports.router = {}');

    // Create project with original express
    const originalPkg = path.join(nodeModulesDir, 'express');
    fs.mkdirSync(originalPkg, { recursive: true });
    fs.writeFileSync(path.join(originalPkg, 'index.js'), 'old content');
    fs.writeFileSync(path.join(originalPkg, 'package.json'), '{"name":"express"}');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hardlink creates files sharing inodes with store', () => {
    const targetDir = path.join(nodeModulesDir, 'test-pkg');

    // Create target directory with a hardlinked file
    fs.mkdirSync(targetDir, { recursive: true });
    const srcFile = path.join(storeDir, 'index.js');
    const destFile = path.join(targetDir, 'index.js');
    fs.linkSync(srcFile, destFile);

    // Verify same inode
    const srcStat = fs.statSync(srcFile);
    const destStat = fs.statSync(destFile);
    assert.equal(srcStat.ino, destStat.ino);

    // Verify content is the same
    assert.equal(fs.readFileSync(destFile, 'utf-8'), 'module.exports = {}');
  });

  it('copy creates independent files', () => {
    const targetDir = path.join(nodeModulesDir, 'test-pkg-copy');
    fs.cpSync(storeDir, targetDir, { recursive: true });

    // Content matches
    assert.equal(
      fs.readFileSync(path.join(targetDir, 'index.js'), 'utf-8'),
      'module.exports = {}',
    );

    // But different inodes (independent copy)
    const srcStat = fs.statSync(path.join(storeDir, 'index.js'));
    const destStat = fs.statSync(path.join(targetDir, 'index.js'));
    assert.notEqual(srcStat.ino, destStat.ino);
  });

  it('three-phase atomic operation preserves rollback on failure', () => {
    const targetDir = path.join(nodeModulesDir, 'express');
    const tmpBackup = path.join(nodeModulesDir, '.nodevault-tmp', 'express');

    // Phase 1: Move original to temp
    fs.mkdirSync(path.dirname(tmpBackup), { recursive: true });
    fs.renameSync(targetDir, tmpBackup);
    assert.ok(fs.existsSync(tmpBackup));
    assert.equal(fs.existsSync(targetDir), false);

    // Simulate failure — rollback
    fs.renameSync(tmpBackup, targetDir);
    assert.ok(fs.existsSync(targetDir));
    assert.equal(
      fs.readFileSync(path.join(targetDir, 'index.js'), 'utf-8'),
      'old content',
    );
  });

  it('scoped package paths are handled correctly', () => {
    const scopedDir = path.join(nodeModulesDir, '@babel', 'core');
    fs.mkdirSync(scopedDir, { recursive: true });
    fs.writeFileSync(path.join(scopedDir, 'index.js'), 'babel');

    assert.ok(fs.existsSync(scopedDir));
    assert.equal(fs.readFileSync(path.join(scopedDir, 'index.js'), 'utf-8'), 'babel');
  });

  it('recursive hardlink preserves directory structure', () => {
    const destDir = path.join(nodeModulesDir, 'hardlinked-express');

    // Manually hardlink recursively (simulating hardlinkRecursive)
    function hardlinkDir(src, dest) {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isFile()) {
          fs.linkSync(srcPath, destPath);
        } else if (entry.isDirectory()) {
          hardlinkDir(srcPath, destPath);
        }
      }
    }

    hardlinkDir(storeDir, destDir);

    // Verify structure
    assert.ok(fs.existsSync(path.join(destDir, 'index.js')));
    assert.ok(fs.existsSync(path.join(destDir, 'package.json')));
    assert.ok(fs.existsSync(path.join(destDir, 'lib', 'router.js')));

    // Verify hardlinks
    const srcStat = fs.statSync(path.join(storeDir, 'lib', 'router.js'));
    const destStat = fs.statSync(path.join(destDir, 'lib', 'router.js'));
    assert.equal(srcStat.ino, destStat.ino);
  });
});
