import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { detectPackageManager, dirSize, isPnpmVirtualStore } from '../utils.js';
import { classifyProject } from './lifecycle.js';

export function scanDirectory(targetPath, options = {}) {
  const config = loadConfig();
  const maxDepth = options.depth ?? config.scanDepth;
  const ignoreDirs = new Set(config.ignoreDirs);
  const visited = new Set();
  const projects = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this directory is a Node project
    const hasPackageJson = entries.some(e => e.isFile() && e.name === 'package.json');
    const hasNodeModules = entries.some(e => e.isDirectory() && e.name === 'node_modules');

    if (hasPackageJson && hasNodeModules) {
      const nodeModulesPath = path.join(dir, 'node_modules');

      // Check for inode loop
      try {
        const stat = fs.lstatSync(nodeModulesPath);
        const inode = `${stat.dev}:${stat.ino}`;
        if (visited.has(inode)) return;
        visited.add(inode);
      } catch {
        return;
      }

      const pm = detectPackageManager(dir);
      const pnpmVirtual = isPnpmVirtualStore(dir);

      let totalSize = 0;
      try {
        totalSize = dirSize(nodeModulesPath);
      } catch { /* skip */ }

      const pkgJsonPath = path.join(dir, 'package.json');
      let name = path.basename(dir);
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkgJson.name) name = pkgJson.name;
      } catch { /* use dir name */ }

      let lastAccessedAt = 0;
      try {
        const stat = fs.statSync(pkgJsonPath);
        lastAccessedAt = Math.floor(stat.mtimeMs);
      } catch { /* skip */ }

      const project = {
        path: dir,
        name,
        packageManager: pm,
        pnpmVirtualStore: pnpmVirtual,
        totalSizeBytes: totalSize,
        lastAccessedAt,
        status: 'active',
      };

      project.status = classifyProject(dir, null);
      projects.push(project);
    }

    // Continue walking subdirectories (but not into node_modules itself)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.')) continue;
      if (ignoreDirs.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink()) continue;
      } catch {
        continue;
      }

      walk(fullPath, depth + 1);
    }
  }

  walk(targetPath, 0);
  return projects;
}
