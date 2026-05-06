import fs from 'node:fs';
import path from 'node:path';
import { daysAgo } from '../utils.js';
import { loadConfig } from '../config.js';

export function classifyProject(projectPath, dbRecord) {
  const config = loadConfig();
  const lastActivity = getLastActivity(projectPath, dbRecord);
  const days = daysAgo(lastActivity);

  if (days >= config.archiveThresholdDays) return 'archived';
  if (days >= config.staleThresholdDays) return 'stale';
  return 'active';
}

function getLastActivity(projectPath, dbRecord) {
  const signals = [];

  // Primary: mtime of package.json
  try {
    const stat = fs.statSync(path.join(projectPath, 'package.json'));
    signals.push(stat.mtimeMs);
  } catch { /* missing */ }

  // Secondary: most recent mtime in src/
  try {
    const srcDir = path.join(projectPath, 'src');
    if (fs.existsSync(srcDir)) {
      const newest = findNewestFile(srcDir, 2);
      if (newest) signals.push(newest);
    }
  } catch { /* missing */ }

  // Tertiary: last_scanned_at from DB
  if (dbRecord?.last_scanned_at) {
    signals.push(dbRecord.last_scanned_at * 1000);
  }

  if (signals.length === 0) return 0;
  return Math.max(...signals);
}

function findNewestFile(dir, maxDepth, currentDepth = 0) {
  if (currentDepth > maxDepth) return 0;
  let newest = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        const stat = fs.lstatSync(full);
        if (stat.isFile()) {
          newest = Math.max(newest, stat.mtimeMs);
        } else if (stat.isDirectory() && !stat.isSymbolicLink()) {
          newest = Math.max(newest, findNewestFile(full, maxDepth, currentDepth + 1));
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return newest;
}
