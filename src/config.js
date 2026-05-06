import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Root directory for NodeVault state (~/.nodevault by default).
 * Set NODEVAULT_HOME to an absolute path for tests or alternate installs.
 */
export function getNodevaultRoot() {
  const override = process.env.NODEVAULT_HOME;
  if (override != null && String(override).trim() !== '') {
    return path.resolve(String(override).trim());
  }
  return path.join(os.homedir(), '.nodevault');
}

function buildPaths(root) {
  const storePath = path.join(root, 'store');
  return {
    nodevaultDir: root,
    configPath: path.join(root, 'config.json'),
    dbPath: path.join(root, 'vault.db'),
    storePath,
    stagingPath: path.join(storePath, '.staging'),
    pidPath: path.join(root, 'daemon.pid'),
    portPath: path.join(root, 'daemon.port'),
    logPath: path.join(root, 'daemon.log'),
  };
}

let _cachedRoot = null;
let _cachedPaths = null;

export function getPaths() {
  const root = getNodevaultRoot();
  if (_cachedRoot !== root) {
    _cachedRoot = root;
    _cachedPaths = buildPaths(root);
  }
  return _cachedPaths;
}

/** Path bundle; resolves against NODEVAULT_HOME / ~/.nodevault on each property read. */
export const paths = new Proxy(
  /** @type {Record<string, never>} */ ({}),
  {
    get(_, prop) {
      return /** @type {any} */ (getPaths())[prop];
    },
  },
);

function getDefaultSettings() {
  const p = getPaths();
  return {
    storePath: p.storePath,
    linkStrategy: 'hardlink',
    watchDirs: [],
    scanDepth: 4,
    staleThresholdDays: 30,
    archiveThresholdDays: 90,
    autoLink: true,
    autoCleanArchived: false,
    notifyBeforeDelete: true,
    ignoreDirs: ['node_modules/.cache', '.next', 'dist', '.git'],
    ignoreProjects: [],
    daemonPort: 7654,
  };
}

export function expandPath(p) {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

export function loadConfig() {
  let userConfig = {};
  if (fs.existsSync(paths.configPath)) {
    try {
      const raw = fs.readFileSync(paths.configPath, 'utf-8');
      userConfig = JSON.parse(raw);
    } catch (err) {
      console.error(`Warning: could not parse ${paths.configPath} — using defaults. ${err.message}`);
    }
  }

  const config = { ...getDefaultSettings(), ...userConfig };
  config.storePath = expandPath(config.storePath);
  config.watchDirs = config.watchDirs.map(expandPath);
  return config;
}

export function saveConfig(config) {
  fs.mkdirSync(paths.nodevaultDir, { recursive: true });

  const toSave = { ...config };
  toSave.storePath = config.storePath.replace(os.homedir(), '~');
  toSave.watchDirs = config.watchDirs.map(d => d.replace(os.homedir(), '~'));

  fs.writeFileSync(paths.configPath, JSON.stringify(toSave, null, 2) + '\n');
}

export function configExists() {
  return fs.existsSync(paths.configPath);
}
