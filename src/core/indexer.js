import fs from 'node:fs';
import path from 'node:path';
import { hasNativeBindings } from '../utils.js';

export function indexProject(projectPath) {
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) return [];

  const packages = [];
  const visited = new Set();

  function readPackageDir(dir, scope) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Handle scoped packages (@org/name)
      if (entry.name.startsWith('@')) {
        readPackageDir(path.join(dir, entry.name), entry.name);
        continue;
      }

      // Skip hidden dirs and .cache
      if (entry.name.startsWith('.')) continue;

      const pkgName = scope ? `${scope}/${entry.name}` : entry.name;
      const pkgDir = path.join(dir, entry.name);
      const pkgJsonPath = path.join(pkgDir, 'package.json');

      try {
        const stat = fs.lstatSync(pkgDir);
        if (stat.isSymbolicLink()) continue;

        const inode = `${stat.dev}:${stat.ino}`;
        if (visited.has(inode)) continue;
        visited.add(inode);
      } catch {
        continue;
      }

      let version;
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        version = pkgJson.version;
      } catch {
        continue; // No valid package.json — skip
      }

      if (!version) continue;

      const native = hasNativeBindings(pkgDir);

      packages.push({
        name: pkgName,
        version,
        resolvedPath: pkgDir,
        native,
      });
    }
  }

  readPackageDir(nodeModulesPath, null);
  return packages;
}

export function findDuplicates(projectsWithPackages) {
  const packageCounts = new Map();

  for (const { packages } of projectsWithPackages) {
    for (const pkg of packages) {
      const key = `${pkg.name}@${pkg.version}`;
      packageCounts.set(key, (packageCounts.get(key) || 0) + 1);
    }
  }

  let duplicateCount = 0;
  for (const [, count] of packageCounts) {
    if (count > 1) duplicateCount += count - 1;
  }

  return { packageCounts, duplicateCount };
}
