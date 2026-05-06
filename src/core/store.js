import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, paths } from '../config.js';
import { storeKey, dirSize, copyRecursive, rmrf } from '../utils.js';
import { upsertPackage, getPackage } from '../db/database.js';

export function ensureStoreExists() {
  fs.mkdirSync(paths.storePath, { recursive: true });
  fs.mkdirSync(paths.stagingPath, { recursive: true });
}

export function getStorePath(name, version) {
  return path.join(paths.storePath, storeKey(name, version));
}

export function packageExistsInStore(name, version) {
  return fs.existsSync(getStorePath(name, version));
}

export function addToStore(name, version, sourcePath) {
  const destPath = getStorePath(name, version);

  // Already in store
  if (fs.existsSync(destPath)) {
    return { storePath: destPath, alreadyExisted: true };
  }

  const stagingDest = path.join(paths.stagingPath, storeKey(name, version));

  try {
    // Try atomic rename first (same filesystem)
    fs.mkdirSync(path.dirname(stagingDest), { recursive: true });
    copyRecursive(sourcePath, stagingDest);

    // Move from staging to final store path
    fs.renameSync(stagingDest, destPath);
  } catch (err) {
    // Clean up staging on failure
    try { rmrf(stagingDest); } catch (cleanupErr) {
      console.error(`Failed to clean staging for ${name}@${version}: ${cleanupErr.message}`);
    }
    throw err;
  }

  // Record in database
  const sizeBytes = dirSize(destPath);
  upsertPackage({ name, version, storePath: destPath, sizeBytes });

  return { storePath: destPath, alreadyExisted: false };
}

export function removeFromStore(name, version) {
  const storePath = getStorePath(name, version);
  if (fs.existsSync(storePath)) {
    rmrf(storePath);
  }
}

export function cleanStaging() {
  if (fs.existsSync(paths.stagingPath)) {
    const entries = fs.readdirSync(paths.stagingPath);
    for (const entry of entries) {
      rmrf(path.join(paths.stagingPath, entry));
    }
  }
}

export function getStoreSize() {
  if (!fs.existsSync(paths.storePath)) return 0;
  return dirSize(paths.storePath);
}

export function getStorePackageCount() {
  if (!fs.existsSync(paths.storePath)) return 0;
  try {
    const entries = fs.readdirSync(paths.storePath);
    return entries.filter(e => !e.startsWith('.')).length;
  } catch {
    return 0;
  }
}
