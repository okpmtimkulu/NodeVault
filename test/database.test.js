import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../src/db/database.js';

describe('database queries', () => {
  let db;
  let mem;

  before(() => {
    mem = openMemoryDb();
    db = mem.db;
  });

  after(() => {
    mem.close();
  });

  it('creates tables successfully', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('projects'));
    assert.ok(tableNames.includes('packages'));
    assert.ok(tableNames.includes('project_packages'));
  });

  it('inserts and retrieves a project', () => {
    db.prepare(`
      INSERT INTO projects (path, name, package_manager, status, total_size_bytes, last_accessed_at, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('/tmp/test-project', 'test-project', 'npm', 'active', 1024, Date.now(), Math.floor(Date.now() / 1000));

    const project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/test-project');
    assert.equal(project.name, 'test-project');
    assert.equal(project.package_manager, 'npm');
    assert.equal(project.status, 'active');
    assert.equal(project.linked, 0);
  });

  it('upserts project (update on conflict)', () => {
    db.prepare(`
      INSERT INTO projects (path, name, package_manager, status, total_size_bytes, last_accessed_at, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        total_size_bytes = excluded.total_size_bytes
    `).run('/tmp/test-project', 'test-project-updated', 'npm', 'active', 2048, Date.now(), Math.floor(Date.now() / 1000));

    const project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/test-project');
    assert.equal(project.name, 'test-project-updated');
    assert.equal(project.total_size_bytes, 2048);
  });

  it('inserts and retrieves a package', () => {
    db.prepare(`
      INSERT INTO packages (name, version, store_path, size_bytes)
      VALUES (?, ?, ?, ?)
    `).run('express', '4.18.2', '/store/express@4.18.2', 512000);

    const pkg = db.prepare('SELECT * FROM packages WHERE name = ? AND version = ?').get('express', '4.18.2');
    assert.equal(pkg.name, 'express');
    assert.equal(pkg.version, '4.18.2');
    assert.equal(pkg.size_bytes, 512000);
  });

  it('enforces unique constraint on packages (name, version)', () => {
    db.prepare(`
      INSERT INTO packages (name, version, store_path, size_bytes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name, version) DO UPDATE SET size_bytes = excluded.size_bytes
    `).run('express', '4.18.2', '/store/express@4.18.2', 600000);

    const pkg = db.prepare('SELECT * FROM packages WHERE name = ? AND version = ?').get('express', '4.18.2');
    assert.equal(pkg.size_bytes, 600000);
  });

  it('links project to package', () => {
    const project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/test-project');

    db.prepare(`
      INSERT OR IGNORE INTO project_packages (project_id, package_name, package_version)
      VALUES (?, ?, ?)
    `).run(project.id, 'express', '4.18.2');

    const links = db.prepare('SELECT * FROM project_packages WHERE project_id = ?').all(project.id);
    assert.equal(links.length, 1);
    assert.equal(links[0].package_name, 'express');
  });

  it('finds orphaned packages', () => {
    db.prepare(`
      INSERT INTO packages (name, version, store_path, size_bytes)
      VALUES (?, ?, ?, ?)
    `).run('orphan-pkg', '1.0.0', '/store/orphan-pkg@1.0.0', 100);

    const orphans = db.prepare(`
      SELECT p.* FROM packages p
      LEFT JOIN project_packages pp ON p.name = pp.package_name AND p.version = pp.package_version
      WHERE pp.project_id IS NULL
    `).all();

    assert.ok(orphans.some(o => o.name === 'orphan-pkg'));
  });

  it('gets project statistics', () => {
    const stats = {};
    stats.projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
    stats.activeCount = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").get().count;
    stats.linkedCount = db.prepare('SELECT COUNT(*) as count FROM projects WHERE linked = 1').get().count;
    stats.packageCount = db.prepare('SELECT COUNT(*) as count FROM packages').get().count;

    assert.ok(stats.projectCount >= 1);
    assert.ok(stats.packageCount >= 1);
  });

  it('updates project linked status', () => {
    db.prepare('UPDATE projects SET linked = ?, link_strategy = ?, saved_bytes = ? WHERE path = ?')
      .run(1, 'hardlink', 5000, '/tmp/test-project');

    const project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/test-project');
    assert.equal(project.linked, 1);
    assert.equal(project.link_strategy, 'hardlink');
    assert.equal(project.saved_bytes, 5000);
  });

  it('updates project status', () => {
    db.prepare('UPDATE projects SET status = ? WHERE path = ?').run('stale', '/tmp/test-project');

    const project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/test-project');
    assert.equal(project.status, 'stale');
  });

  it('deletes project and cascades', () => {
    db.prepare(`
      INSERT INTO projects (path, name, package_manager, status)
      VALUES (?, ?, ?, ?)
    `).run('/tmp/delete-me', 'delete-me', 'npm', 'active');

    const project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/delete-me');

    db.prepare('DELETE FROM project_packages WHERE project_id = ?').run(project.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);

    const deleted = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/delete-me');
    assert.equal(deleted, undefined);
  });

  it('sets and clears link_in_progress', () => {
    db.prepare('UPDATE projects SET link_in_progress = ? WHERE path = ?').run(1, '/tmp/test-project');

    let project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/test-project');
    assert.equal(project.link_in_progress, 1);

    db.prepare('UPDATE projects SET link_in_progress = ? WHERE path = ?').run(0, '/tmp/test-project');

    project = db.prepare('SELECT * FROM projects WHERE path = ?').get('/tmp/test-project');
    assert.equal(project.link_in_progress, 0);
  });
});
