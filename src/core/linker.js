import fs from 'node:fs';
import path from 'node:path';
import { isCrossFilesystem, rmrf, copyRecursive } from '../utils.js';
import { loadConfig, paths } from '../config.js';

export function determineLinkStrategy(projectPath) {
  const config = loadConfig();
  let strategy = config.linkStrategy;

  // Windows: force copy
  if (process.platform === 'win32' && strategy === 'hardlink') {
    strategy = 'copy';
  }

  // Cross-filesystem: fall back to copy
  if (strategy === 'hardlink' && isCrossFilesystem(projectPath, paths.storePath)) {
    strategy = 'copy';
  }

  return strategy;
}

export function linkPackageToProject(storePath, projectNodeModules, packageName, strategy) {
  const targetDir = path.join(projectNodeModules, ...packageName.split('/'));
  const tmpDir = path.join(projectNodeModules, '.nodevault-tmp', ...packageName.split('/'));

  // Ensure tmp parent exists
  fs.mkdirSync(path.dirname(tmpDir), { recursive: true });

  // Phase 1: Move original to temp
  if (fs.existsSync(targetDir)) {
    fs.renameSync(targetDir, tmpDir);
  }

  try {
    // Phase 2: Create link/copy from store
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });

    if (strategy === 'hardlink') {
      hardlinkRecursive(storePath, targetDir);
    } else if (strategy === 'symlink') {
      fs.symlinkSync(storePath, targetDir, 'junction');
    } else {
      copyRecursive(storePath, targetDir);
    }

    // Phase 3: Remove temp backup
    if (fs.existsSync(tmpDir)) {
      rmrf(tmpDir);
    }
  } catch (err) {
    // Rollback: restore from temp
    if (fs.existsSync(tmpDir)) {
      try {
        if (fs.existsSync(targetDir)) rmrf(targetDir);
        fs.renameSync(tmpDir, targetDir);
      } catch (rollbackErr) {
        console.error(`Rollback failed for ${packageName}: ${rollbackErr.message}. Original files may be in ${tmpDir}`);
      }
    }
    throw err;
  }

  // Clean up the .nodevault-tmp directory if empty
  const tmpRoot = path.join(projectNodeModules, '.nodevault-tmp');
  try {
    const remaining = fs.readdirSync(tmpRoot);
    if (remaining.length === 0) rmrf(tmpRoot);
  } catch { /* ignore */ }
}

function hardlinkRecursive(src, dest) {
  const stat = fs.lstatSync(src);

  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.linkSync(src, dest);
    } catch (err) {
      if (err.code === 'EXDEV') {
        // Cross-device — fall back to copy for this file
        fs.copyFileSync(src, dest);
      } else {
        throw err;
      }
    }
    return;
  }

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      hardlinkRecursive(
        path.join(src, entry.name),
        path.join(dest, entry.name)
      );
    }
    return;
  }

  // Skip symlinks and special files
}

export function unlinkPackageFromProject(storePath, projectNodeModules, packageName) {
  const targetDir = path.join(projectNodeModules, ...packageName.split('/'));

  if (!fs.existsSync(targetDir)) return;

  // Remove the linked version
  rmrf(targetDir);

  // Copy fresh from store
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  copyRecursive(storePath, targetDir);
}
