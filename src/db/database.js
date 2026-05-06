import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { paths } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = fileURLToPath(import.meta.resolve('sql.js/dist/sql-wasm.wasm'));
const wasmBinary = fs.readFileSync(wasmPath);

const SQL = await initSqlJs({ wasmBinary });

let db = null;

function bindParams(stmt, args) {
  if (args.length === 0) return;
  const a = args[0];
  if (
    args.length === 1 &&
    a !== null &&
    typeof a === 'object' &&
    !Array.isArray(a) &&
    !(a instanceof Uint8Array) &&
    !Buffer.isBuffer(a)
  ) {
    const named = {};
    for (const [k, v] of Object.entries(a)) {
      named[`@${k}`] = v;
    }
    stmt.bind(named);
    return;
  }
  stmt.bind(args);
}

/** better-sqlite3–compatible surface over sql.js, with optional disk persistence. */
function wrapDatabase(sqlDb, persistPath) {
  function persistIfNeeded() {
    if (!persistPath) return;
    const data = sqlDb.export();
    fs.mkdirSync(path.dirname(persistPath), { recursive: true });
    fs.writeFileSync(persistPath, Buffer.from(data));
  }

  function prepareStatement(sqlText) {
    return {
      run(...args) {
        const stmt = sqlDb.prepare(sqlText);
        try {
          stmt.reset();
          bindParams(stmt, args);
          stmt.step();
          const changes = sqlDb.getRowsModified();
          persistIfNeeded();
          return { changes, lastInsertRowid: 0 };
        } finally {
          stmt.free();
        }
      },
      get(...args) {
        const stmt = sqlDb.prepare(sqlText);
        try {
          stmt.reset();
          bindParams(stmt, args);
          if (!stmt.step()) return undefined;
          return stmt.getAsObject();
        } finally {
          stmt.free();
        }
      },
      all(...args) {
        const stmt = sqlDb.prepare(sqlText);
        try {
          stmt.reset();
          bindParams(stmt, args);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          return rows;
        } finally {
          stmt.free();
        }
      },
    };
  }

  return {
    pragma(pragmaStr) {
      sqlDb.run(`PRAGMA ${pragmaStr}`);
      persistIfNeeded();
    },
    exec(sql) {
      sqlDb.exec(sql);
      persistIfNeeded();
    },
    prepare: prepareStatement,
    close() {
      persistIfNeeded();
      sqlDb.close();
    },
  };
}

/**
 * In-memory DB for tests (same schema path as production).
 * @returns {{ db: ReturnType<typeof wrapDatabase>, close: () => void }}
 */
export function openMemoryDb() {
  const raw = new SQL.Database();
  const wrapped = wrapDatabase(raw, null);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  wrapped.pragma('journal_mode = DELETE');
  wrapped.pragma('foreign_keys = ON');
  wrapped.exec(schema);
  return {
    db: wrapped,
    close: () => {
      raw.close();
    },
  };
}

export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(paths.dbPath), { recursive: true });
  let buffer;
  if (fs.existsSync(paths.dbPath)) {
    const raw = fs.readFileSync(paths.dbPath);
    if (raw.length > 0) {
      buffer = new Uint8Array(raw);
    }
  }

  const rawDb = new SQL.Database(buffer);
  db = wrapDatabase(rawDb, paths.dbPath);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Project queries ───

export function upsertProject(project) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO projects (path, name, package_manager, status, total_size_bytes, last_accessed_at, last_scanned_at)
    VALUES (@path, @name, @packageManager, @status, @totalSizeBytes, @lastAccessedAt, @lastScannedAt)
    ON CONFLICT(path) DO UPDATE SET
      name = @name,
      package_manager = @packageManager,
      status = @status,
      total_size_bytes = @totalSizeBytes,
      last_accessed_at = @lastAccessedAt,
      last_scanned_at = @lastScannedAt,
      linked = 0,
      link_strategy = NULL,
      saved_bytes = 0
  `);
  return stmt.run({
    path: project.path,
    name: project.name,
    packageManager: project.packageManager,
    status: project.status,
    totalSizeBytes: project.totalSizeBytes,
    lastAccessedAt: project.lastAccessedAt,
    lastScannedAt: Math.floor(Date.now() / 1000),
  });
}

export function getAllProjects() {
  const db = getDb();
  return db.prepare('SELECT * FROM projects ORDER BY name').all();
}

export function getProjectByPath(projectPath) {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath);
}

export function getProjectsByStatus(status) {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE status = ?').all(status);
}

export function updateProjectLinked(projectPath, linked, linkStrategy, savedBytes) {
  const db = getDb();
  db.prepare(`
    UPDATE projects SET linked = ?, link_strategy = ?, saved_bytes = ? WHERE path = ?
  `).run(linked ? 1 : 0, linkStrategy, savedBytes, projectPath);
}

export function setLinkInProgress(projectPath, inProgress) {
  const db = getDb();
  db.prepare('UPDATE projects SET link_in_progress = ? WHERE path = ?')
    .run(inProgress ? 1 : 0, projectPath);
}

export function updateProjectStatus(projectPath, status) {
  const db = getDb();
  db.prepare('UPDATE projects SET status = ? WHERE path = ?').run(status, projectPath);
}

export function deleteProject(projectPath) {
  const db = getDb();
  const project = getProjectByPath(projectPath);
  if (project) {
    db.prepare('DELETE FROM project_packages WHERE project_id = ?').run(project.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  }
}

// ─── Package queries ───

export function upsertPackage(pkg) {
  const db = getDb();
  db.prepare(`
    INSERT INTO packages (name, version, store_path, size_bytes)
    VALUES (@name, @version, @storePath, @sizeBytes)
    ON CONFLICT(name, version) DO UPDATE SET
      size_bytes = @sizeBytes
  `).run({
    name: pkg.name,
    version: pkg.version,
    storePath: pkg.storePath,
    sizeBytes: pkg.sizeBytes,
  });
}

export function getPackage(name, version) {
  const db = getDb();
  return db.prepare('SELECT * FROM packages WHERE name = ? AND version = ?').get(name, version);
}

export function getAllPackages() {
  const db = getDb();
  return db.prepare('SELECT * FROM packages').all();
}

export function deletePackage(name, version) {
  const db = getDb();
  db.prepare('DELETE FROM packages WHERE name = ? AND version = ?').run(name, version);
}

// ─── Project-Package relationship ───

export function linkProjectPackage(projectId, packageName, packageVersion) {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO project_packages (project_id, package_name, package_version)
    VALUES (?, ?, ?)
  `).run(projectId, packageName, packageVersion);
}

export function clearProjectPackages(projectId) {
  const db = getDb();
  db.prepare('DELETE FROM project_packages WHERE project_id = ?').run(projectId);
}

export function getOrphanedPackages() {
  const db = getDb();
  return db.prepare(`
    SELECT p.* FROM packages p
    LEFT JOIN project_packages pp ON p.name = pp.package_name AND p.version = pp.package_version
    WHERE pp.project_id IS NULL
  `).all();
}

// ─── Aggregates ───

export function getStats() {
  const db = getDb();
  const projects = db.prepare('SELECT COUNT(*) as count FROM projects').get();
  const active = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").get();
  const stale = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'stale'").get();
  const archived = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'archived'").get();
  const linked = db.prepare('SELECT COUNT(*) as count FROM projects WHERE linked = 1').get();
  const totalSize = db.prepare('SELECT COALESCE(SUM(total_size_bytes), 0) as total FROM projects').get();
  const savedSize = db.prepare('SELECT COALESCE(SUM(saved_bytes), 0) as total FROM projects').get();
  const packageCount = db.prepare('SELECT COUNT(*) as count FROM packages').get();
  const storeSize = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM packages').get();

  return {
    projectCount: projects.count,
    activeCount: active.count,
    staleCount: stale.count,
    archivedCount: archived.count,
    linkedCount: linked.count,
    totalSizeBytes: totalSize.total,
    savedBytes: savedSize.total,
    packageCount: packageCount.count,
    storeSizeBytes: storeSize.total,
  };
}
