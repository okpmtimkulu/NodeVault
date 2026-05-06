import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, paths } from '../config.js';
import { getStats, getAllProjects } from '../db/database.js';
import { getStoreSize, getStorePackageCount } from '../core/store.js';
import { formatBytes } from '../utils.js';

const DASHBOARD_PATH = fileURLToPath(new URL('../../dashboard/index.html', import.meta.url));

/** Cache dashboard HTML in memory (small file, avoids repeated I/O). */
let dashboardHtml = null;
function getDashboardHtml() {
  if (!dashboardHtml) {
    try { dashboardHtml = fs.readFileSync(DASHBOARD_PATH, 'utf-8'); } catch { dashboardHtml = null; }
  }
  return dashboardHtml;
}

export function createServer(options = {}) {
  const config = loadConfig();
  const port = options.port || config.daemonPort;

  const server = http.createServer((req, res) => {
    // CORS for local dashboard
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    try {
      switch (url.pathname) {
        case '/api/status':
          handleStatus(req, res);
          break;
        case '/api/projects':
          handleProjects(req, res);
          break;
        case '/api/health':
          json(res, { ok: true, uptime: process.uptime() });
          break;
        case '/': {
          const html = getDashboardHtml();
          if (html) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(html);
          } else {
            res.writeHead(404);
            res.end('Dashboard not found');
          }
          break;
        }
        default:
          res.writeHead(404);
          json(res, { error: 'Not found' });
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      try { res.end(JSON.stringify({ error: err.message })); } catch { /* already closed */ }
    }
  });

  return new Promise((resolve, reject) => {
    let currentPort = port;
    const maxRetries = 10;

    function tryListen(attempt) {
      server.listen(currentPort, '127.0.0.1', () => {
        fs.writeFileSync(paths.portPath, String(currentPort));
        resolve({ server, port: currentPort });
      });

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
          currentPort++;
          tryListen(attempt + 1);
        } else {
          reject(err);
        }
      });
    }

    tryListen(0);
  });
}

function json(res, data) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function handleStatus(req, res) {
  const stats = getStats();
  const storeSize = getStoreSize();
  const storePackages = getStorePackageCount();

  json(res, {
    store: {
      path: paths.storePath,
      size: storeSize,
      sizeFormatted: formatBytes(storeSize),
      packages: storePackages,
    },
    projects: {
      total: stats.projectCount,
      active: stats.activeCount,
      stale: stats.staleCount,
      archived: stats.archivedCount,
      linked: stats.linkedCount,
    },
    disk: {
      totalNodeModules: stats.totalSizeBytes,
      totalFormatted: formatBytes(stats.totalSizeBytes),
      saved: stats.savedBytes,
      savedFormatted: formatBytes(stats.savedBytes),
    },
  });
}

function handleProjects(req, res) {
  const projects = getAllProjects();
  json(res, projects.map(p => ({
    id: p.id,
    name: p.name,
    path: p.path,
    packageManager: p.package_manager,
    status: p.status,
    linked: !!p.linked,
    linkStrategy: p.link_strategy,
    totalSizeBytes: p.total_size_bytes,
    savedBytes: p.saved_bytes,
    lastAccessedAt: p.last_accessed_at,
    firstSeenAt: p.first_seen_at,
    lastScannedAt: p.last_scanned_at,
  })));
}
