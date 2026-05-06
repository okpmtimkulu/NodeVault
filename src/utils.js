import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Display path with ~ for home; middle-ellipsis if longer than maxLen (terminal-friendly).
 */
export function shortenPath(absPath, maxLen = 56) {
  const s = String(absPath);
  const home = os.homedir();
  let shortened =
    home && (s === home || s.startsWith(home + path.sep)) ? `~${s.slice(home.length)}` : s;
  if (shortened.length <= maxLen) return shortened;
  if (maxLen < 8) return shortened.slice(0, maxLen);
  const inner = maxLen - 3;
  const left = Math.ceil(inner / 2);
  const right = Math.floor(inner / 2);
  return shortened.slice(0, left) + '…' + shortened.slice(-right);
}

/** Hard truncate a line to fit the terminal (session log lines may still be very long). */
export function truncateLine(str, maxLen) {
  const s = String(str);
  if (s.length <= maxLen) return s;
  if (maxLen < 2) return s.slice(0, maxLen);
  return s.slice(0, maxLen - 1) + '…';
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function isCrossFilesystem(pathA, pathB) {
  try {
    const devA = fs.statSync(pathA).dev;
    const devB = fs.statSync(pathB).dev;
    return devA !== devB;
  } catch {
    return false;
  }
}

export function dirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isFile()) {
          total += stat.size;
        } else if (stat.isDirectory() && !stat.isSymbolicLink()) {
          total += dirSize(fullPath);
        }
      } catch {
        // skip inaccessible files
      }
    }
  } catch {
    // skip inaccessible dirs
  }
  return total;
}

export function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

export function copyRecursive(src, dest) {
  fs.cpSync(src, dest, { recursive: true, preserveTimestamps: true });
}

export function hasNativeBindings(pkgDir) {
  try {
    const entries = fs.readdirSync(pkgDir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.node')) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export function detectPackageManager(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export function isPnpmVirtualStore(projectPath) {
  return fs.existsSync(path.join(projectPath, 'node_modules', '.pnpm'));
}

export function escapePackageName(name) {
  // @tanstack/react-query → _tanstack__react-query
  return name.replace(/^@/, '_').replace(/\//g, '__');
}

export function storeKey(name, version) {
  return `${escapePackageName(name)}@${version}`;
}

export function daysAgo(timestamp) {
  const now = Date.now();
  return Math.floor((now - timestamp) / (1000 * 60 * 60 * 24));
}

export function relativeTime(date) {
  const days = daysAgo(date instanceof Date ? date.getTime() : date);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
