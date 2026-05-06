import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { closeDb, getProjectByPath, getPackage, upsertPackage } from '../src/db/database.js';
import { initCommand } from '../src/commands/init.js';
import { statusCommand } from '../src/commands/status.js';
import { scanCommand } from '../src/commands/scan.js';
import { linkCommand } from '../src/commands/link.js';
import { unlinkCommand } from '../src/commands/unlink.js';
import { listCommand } from '../src/commands/list.js';
import { pruneCommand } from '../src/commands/prune.js';
import { cleanCommand } from '../src/commands/clean.js';
import { daemonCommand } from '../src/commands/daemon.js';
import { ensureStoreExists, getStorePath } from '../src/core/store.js';
import { storeKey } from '../src/utils.js';
import * as output from '../src/output.js';

describe('command integration (isolated NODEVAULT_HOME)', () => {
  let tmpRoot;
  let prevHome;
  let projectsParent;

  function createNodeProject(dir, name) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    const nm = path.join(dir, 'node_modules', 'tiny-dep');
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(
      path.join(nm, 'package.json'),
      JSON.stringify({ name: 'tiny-dep', version: '0.0.1' }),
    );
    fs.writeFileSync(path.join(nm, 'index.js'), 'module.exports = 1');
    const now = new Date();
    fs.utimesSync(path.join(dir, 'package.json'), now, now);
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-int-'));
    projectsParent = fs.mkdtempSync(path.join(tmpRoot, 'projects-'));
    prevHome = process.env.NODEVAULT_HOME;
    process.env.NODEVAULT_HOME = tmpRoot;
  });

  afterEach(() => {
    closeDb();
    if (prevHome === undefined) delete process.env.NODEVAULT_HOME;
    else process.env.NODEVAULT_HOME = prevHome;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('init creates config, store, and database', async () => {
    await initCommand();
    assert.ok(fs.existsSync(path.join(tmpRoot, 'config.json')));
    assert.ok(fs.existsSync(path.join(tmpRoot, 'store')));
    assert.ok(fs.existsSync(path.join(tmpRoot, 'vault.db')));
  });

  it('init when already initialized warns and does not throw', async () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      await initCommand();
      await initCommand();
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('already initialized')));
  });

  it('status errors when not initialized', async () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      await statusCommand({});
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('not initialized')));
  });

  it('status --json after init returns structured output', async () => {
    await initCommand();
    let printed = '';
    const orig = console.log;
    console.log = (msg) => {
      printed = typeof msg === 'string' ? msg : JSON.stringify(msg);
    };
    try {
      await statusCommand({ json: true });
    } finally {
      console.log = orig;
    }
    const data = JSON.parse(printed);
    assert.equal(typeof data.projects.total, 'number');
    assert.equal(typeof data.store.path, 'string');
  });

  it('scan → list → link → unlink workflow', async () => {
    await initCommand();
    const appDir = path.join(projectsParent, 'my-app');
    createNodeProject(appDir, 'my-app');

    output.setOutputSink(() => {});
    try {
      scanCommand(appDir, { depth: 4 });
    } finally {
      output.clearOutputSink();
    }

    const row = getProjectByPath(path.resolve(appDir));
    assert.ok(row, 'project should be in DB after scan');
    assert.equal(row.name, 'my-app');

    const listLines = [];
    output.setOutputSink((line) => listLines.push(line));
    try {
      listCommand({ sort: 'name' });
    } finally {
      output.clearOutputSink();
    }
    assert.ok(listLines.some((l) => l.includes('my-app')));

    output.setOutputSink(() => {});
    try {
      linkCommand(path.resolve(appDir), {});
    } finally {
      output.clearOutputSink();
    }

    const linked = getProjectByPath(path.resolve(appDir));
    assert.equal(linked.linked, 1);
    const storePkg = path.join(tmpRoot, 'store', storeKey('tiny-dep', '0.0.1'));
    assert.ok(fs.existsSync(storePkg));

    output.setOutputSink(() => {});
    try {
      unlinkCommand(path.resolve(appDir));
    } finally {
      output.clearOutputSink();
    }

    const unlinked = getProjectByPath(path.resolve(appDir));
    assert.equal(unlinked.linked, 0);
  });

  it('list with filter yields no matches message', async () => {
    await initCommand();
    const appDir = path.join(projectsParent, 'solo');
    createNodeProject(appDir, 'solo');
    output.setOutputSink(() => {});
    try {
      scanCommand(appDir, {});
    } finally {
      output.clearOutputSink();
    }

    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      listCommand({ filter: 'stale' });
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('No projects match')));
  });

  it('prune --force removes orphaned store packages', async () => {
    await initCommand();
    ensureStoreExists();
    const dest = getStorePath('lonely', '9.9.9');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'x.js'), '1');
    upsertPackage({
      name: 'lonely',
      version: '9.9.9',
      storePath: dest,
      sizeBytes: 1,
    });

    output.setOutputSink(() => {});
    try {
      await pruneCommand({ force: true });
    } finally {
      output.clearOutputSink();
    }

    assert.equal(getPackage('lonely', '9.9.9'), undefined);
    assert.equal(fs.existsSync(dest), false);
  });

  it('clean --all --force with nothing to clean reports summary', async () => {
    await initCommand();
    output.setOutputSink(() => {});
    try {
      await cleanCommand({ all: true, force: true });
    } finally {
      output.clearOutputSink();
    }
  });

  it('daemon unknown action prints usage hint', () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      daemonCommand('nope');
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('Unknown daemon action')));
  });

  it('daemon logs reads log file', () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'daemon.log'), 'line-a\nline-b\n', 'utf8');
    process.env.NODEVAULT_HOME = tmpRoot;

    const out = [];
    const orig = console.log;
    console.log = (x) => out.push(String(x));
    try {
      daemonCommand('logs');
    } finally {
      console.log = orig;
    }
    assert.ok(out.some((l) => l.includes('line-b')));
  });

  it('link without project path errors', () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      linkCommand(undefined, {});
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('Specify a project path') || l.includes('Specify')));
  });

  it('unlink without target errors', () => {
    const lines = [];
    output.setOutputSink((line) => lines.push(line));
    try {
      unlinkCommand(undefined);
    } finally {
      output.clearOutputSink();
    }
    assert.ok(lines.some((l) => l.includes('Specify a project path')));
  });

  it('re-scan resets linked flag so link --all re-links on next run', async () => {
    await initCommand();
    const appDir = path.join(projectsParent, 're-scan-app');
    createNodeProject(appDir, 're-scan-app');

    output.setOutputSink(() => {});
    try {
      // First scan + link
      scanCommand(appDir, { depth: 4 });
      linkCommand(path.resolve(appDir), {});

      const afterLink = getProjectByPath(path.resolve(appDir));
      assert.equal(afterLink.linked, 1, 'project should be linked after link command');

      // Simulate npm install: add a new package and re-scan
      const newPkg = path.join(appDir, 'node_modules', 'new-dep');
      fs.mkdirSync(newPkg, { recursive: true });
      fs.writeFileSync(path.join(newPkg, 'package.json'), '{"name":"new-dep","version":"1.0.0"}');
      fs.writeFileSync(path.join(newPkg, 'index.js'), '');

      // Re-scan should reset linked = 0
      scanCommand(appDir, { depth: 4 });
      const afterRescan = getProjectByPath(path.resolve(appDir));
      assert.equal(afterRescan.linked, 0, 're-scan must reset linked to 0');

      // link --all should now process the project again (not skip it)
      const lines = [];
      output.setOutputSink((line) => lines.push(line));
      linkCommand(null, { all: true });
      output.clearOutputSink();

      assert.ok(
        !lines.some((l) => l.includes('Already linked')),
        'should not skip project after re-scan',
      );
      const afterRelink = getProjectByPath(path.resolve(appDir));
      assert.equal(afterRelink.linked, 1, 'project should be re-linked');
    } finally {
      output.clearOutputSink();
    }
  });
});
