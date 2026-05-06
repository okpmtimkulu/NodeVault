import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { scanDirectory } from '../src/core/scanner.js';

describe('scanDirectory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-scan-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createProject(dir, name, pm = 'npm') {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    // Touch package.json recently so it's classified as active
    const now = new Date();
    fs.utimesSync(path.join(dir, 'package.json'), now, now);
    if (pm === 'yarn') {
      fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    } else if (pm === 'pnpm') {
      fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    }
  }

  it('finds a project with package.json and node_modules', () => {
    createProject(path.join(tmpDir, 'my-app'), 'my-app');

    const projects = scanDirectory(tmpDir, { depth: 4 });
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'my-app');
    assert.equal(projects[0].packageManager, 'npm');
  });

  it('finds multiple projects', () => {
    createProject(path.join(tmpDir, 'app1'), 'app1');
    createProject(path.join(tmpDir, 'app2'), 'app2');

    const projects = scanDirectory(tmpDir, { depth: 4 });
    assert.equal(projects.length, 2);
  });

  it('detects package manager correctly', () => {
    createProject(path.join(tmpDir, 'yarn-app'), 'yarn-app', 'yarn');
    createProject(path.join(tmpDir, 'pnpm-app'), 'pnpm-app', 'pnpm');

    const projects = scanDirectory(tmpDir, { depth: 4 });
    const yarnProject = projects.find(p => p.name === 'yarn-app');
    const pnpmProject = projects.find(p => p.name === 'pnpm-app');

    assert.equal(yarnProject.packageManager, 'yarn');
    assert.equal(pnpmProject.packageManager, 'pnpm');
  });

  it('returns empty for dir without projects', () => {
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '');
    const projects = scanDirectory(tmpDir, { depth: 4 });
    assert.equal(projects.length, 0);
  });

  it('skips dirs without node_modules', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    // No node_modules created
    const projects = scanDirectory(tmpDir, { depth: 4 });
    assert.equal(projects.length, 0);
  });

  it('respects depth limit', () => {
    // Create a deeply nested project
    const deepDir = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e', 'deep-app');
    createProject(deepDir, 'deep-app');

    const shallow = scanDirectory(tmpDir, { depth: 2 });
    assert.equal(shallow.length, 0);

    const deep = scanDirectory(tmpDir, { depth: 10 });
    assert.equal(deep.length, 1);
  });

  it('detects pnpm virtual store', () => {
    const dir = path.join(tmpDir, 'pnpm-app');
    createProject(dir, 'pnpm-app', 'pnpm');
    fs.mkdirSync(path.join(dir, 'node_modules', '.pnpm'), { recursive: true });

    const projects = scanDirectory(tmpDir, { depth: 4 });
    const project = projects.find(p => p.name === 'pnpm-app');
    assert.equal(project.pnpmVirtualStore, true);
  });

  it('skips hidden directories', () => {
    const hiddenDir = path.join(tmpDir, '.hidden');
    createProject(hiddenDir, 'hidden-app');

    const projects = scanDirectory(tmpDir, { depth: 4 });
    assert.equal(projects.length, 0);
  });

  it('uses dir name when package.json has no name', () => {
    const dir = path.join(tmpDir, 'unnamed-app');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    const now = new Date();
    fs.utimesSync(path.join(dir, 'package.json'), now, now);

    const projects = scanDirectory(tmpDir, { depth: 4 });
    assert.equal(projects[0].name, 'unnamed-app');
  });
});
