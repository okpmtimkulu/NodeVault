CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  package_manager TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  linked INTEGER NOT NULL DEFAULT 0,
  link_strategy TEXT,
  link_in_progress INTEGER DEFAULT 0,
  total_size_bytes INTEGER,
  saved_bytes INTEGER DEFAULT 0,
  last_accessed_at INTEGER,
  first_seen_at INTEGER DEFAULT (unixepoch()),
  last_scanned_at INTEGER
);

CREATE TABLE IF NOT EXISTS packages (
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  store_path TEXT NOT NULL,
  size_bytes INTEGER,
  inode_count INTEGER DEFAULT 1,
  added_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (name, version)
);

CREATE TABLE IF NOT EXISTS project_packages (
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  package_version TEXT NOT NULL,
  FOREIGN KEY (package_name, package_version) REFERENCES packages(name, version),
  PRIMARY KEY (project_id, package_name, package_version)
);
