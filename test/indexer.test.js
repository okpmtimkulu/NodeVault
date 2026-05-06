import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { indexProject, findDuplicates } from '../src/core/indexer.js';

describe('indexProject', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-idx-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array if no node_modules', () => {
    const result = indexProject(tmpDir);
    assert.deepEqual(result, []);
  });

  it('discovers packages with package.json', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const pkgDir = path.join(nm, 'express');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: 'express',
      version: '4.18.2',
    }));
    fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {}');

    const packages = indexProject(tmpDir);
    assert.equal(packages.length, 1);
    assert.equal(packages[0].name, 'express');
    assert.equal(packages[0].version, '4.18.2');
    assert.equal(packages[0].native, false);
  });

  it('discovers scoped packages', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const pkgDir = path.join(nm, '@babel', 'core');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: '@babel/core',
      version: '7.24.0',
    }));

    const packages = indexProject(tmpDir);
    assert.equal(packages.length, 1);
    assert.equal(packages[0].name, '@babel/core');
    assert.equal(packages[0].version, '7.24.0');
  });

  it('skips packages without version', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const pkgDir = path.join(nm, 'broken');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'broken' }));

    const packages = indexProject(tmpDir);
    assert.equal(packages.length, 0);
  });

  it('skips hidden directories', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const hiddenDir = path.join(nm, '.cache');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.writeFileSync(path.join(hiddenDir, 'package.json'), JSON.stringify({
      name: 'cache',
      version: '1.0.0',
    }));

    const packages = indexProject(tmpDir);
    assert.equal(packages.length, 0);
  });

  it('detects native bindings', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const pkgDir = path.join(nm, 'native-addon');
    fs.mkdirSync(path.join(pkgDir, 'build'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: 'native-addon',
      version: '1.0.0',
    }));
    fs.writeFileSync(path.join(pkgDir, 'build', 'binding.node'), '');

    const packages = indexProject(tmpDir);
    assert.equal(packages.length, 1);
    assert.equal(packages[0].native, true);
  });
});

describe('findDuplicates', () => {
  it('counts duplicates across projects', () => {
    const projectsWithPackages = [
      {
        packages: [
          { name: 'lodash', version: '4.17.21' },
          { name: 'express', version: '4.18.2' },
        ],
      },
      {
        packages: [
          { name: 'lodash', version: '4.17.21' },
          { name: 'react', version: '18.2.0' },
        ],
      },
    ];

    const { packageCounts, duplicateCount } = findDuplicates(projectsWithPackages);
    assert.equal(packageCounts.get('lodash@4.17.21'), 2);
    assert.equal(duplicateCount, 1); // 1 duplicate (2nd instance of lodash)
  });

  it('returns 0 duplicates when all unique', () => {
    const projectsWithPackages = [
      { packages: [{ name: 'a', version: '1.0.0' }] },
      { packages: [{ name: 'b', version: '1.0.0' }] },
    ];

    const { duplicateCount } = findDuplicates(projectsWithPackages);
    assert.equal(duplicateCount, 0);
  });

  it('handles empty projects', () => {
    const { duplicateCount } = findDuplicates([]);
    assert.equal(duplicateCount, 0);
  });
});
