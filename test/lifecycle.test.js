import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { classifyProject } from '../src/core/lifecycle.js';

describe('classifyProject', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-lifecycle-'));
    // Create a project with package.json
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns "active" for recently modified project', () => {
    // package.json was just created, so it's recent
    const status = classifyProject(tmpDir, null);
    assert.equal(status, 'active');
  });

  it('returns "stale" for project not touched in 30+ days', () => {
    // Set mtime to 45 days ago
    const daysAgo = 45;
    const pastDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(tmpDir, 'package.json'), pastDate, pastDate);

    const status = classifyProject(tmpDir, null);
    assert.equal(status, 'stale');
  });

  it('returns "archived" for project not touched in 90+ days', () => {
    const daysAgo = 100;
    const pastDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(tmpDir, 'package.json'), pastDate, pastDate);

    const status = classifyProject(tmpDir, null);
    assert.equal(status, 'archived');
  });

  it('considers src/ directory mtime', () => {
    // Set package.json to old
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(tmpDir, 'package.json'), oldDate, oldDate);

    // But src/ has recent files
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '');
    // index.js just created = recent mtime

    const status = classifyProject(tmpDir, null);
    assert.equal(status, 'active');
  });

  it('considers db record last_scanned_at', () => {
    // Set package.json to old
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(tmpDir, 'package.json'), oldDate, oldDate);

    // DB record says scanned recently (epoch seconds)
    const dbRecord = { last_scanned_at: Math.floor(Date.now() / 1000) };
    const status = classifyProject(tmpDir, dbRecord);
    assert.equal(status, 'active');
  });

  it('handles missing package.json gracefully', () => {
    fs.unlinkSync(path.join(tmpDir, 'package.json'));
    // Should not throw, defaults to archived (timestamp = 0)
    const status = classifyProject(tmpDir, null);
    assert.equal(status, 'archived');
  });
});
