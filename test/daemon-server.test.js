import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

import { closeDb } from '../src/db/database.js';
import { initCommand } from '../src/commands/init.js';
import { createServer } from '../src/daemon/server.js';

function httpGet(port, pathname) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${pathname}`, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

describe('daemon HTTP server', () => {
  let tmpRoot;
  let prevHome;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-srv-'));
    prevHome = process.env.NODEVAULT_HOME;
    process.env.NODEVAULT_HOME = tmpRoot;
    await initCommand();
  });

  afterEach(async () => {
    closeDb();
    if (prevHome === undefined) delete process.env.NODEVAULT_HOME;
    else process.env.NODEVAULT_HOME = prevHome;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('/api/health returns ok', async () => {
    const testPort = 35000 + (process.pid % 15000);
    const { server, port } = await createServer({ port: testPort });
    try {
      const r = await httpGet(port, '/api/health');
      assert.equal(r.status, 200);
      const j = JSON.parse(r.body);
      assert.equal(j.ok, true);
    } finally {
      await new Promise((res) => server.close(res));
    }
  });

  it('/api/status returns JSON with project counts', async () => {
    const testPort = 36000 + (process.pid % 15000);
    const { server, port } = await createServer({ port: testPort });
    try {
      const r = await httpGet(port, '/api/status');
      assert.equal(r.status, 200);
      const j = JSON.parse(r.body);
      assert.ok('projects' in j);
      assert.equal(typeof j.projects.total, 'number');
    } finally {
      await new Promise((res) => server.close(res));
    }
  });

  it('OPTIONS returns 204', async () => {
    const testPort = 37000 + (process.pid % 15000);
    const { server, port } = await createServer({ port: testPort });
    try {
      const r = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/api/health',
            method: 'OPTIONS',
          },
          (res) => resolve({ status: res.statusCode }),
        );
        req.on('error', reject);
        req.end();
      });
      assert.equal(r.status, 204);
    } finally {
      await new Promise((res) => server.close(res));
    }
  });
});
