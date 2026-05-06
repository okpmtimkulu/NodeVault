import fs from 'node:fs';
import readline from 'node:readline';
import { getOrphanedPackages, deletePackage } from '../db/database.js';
import { removeFromStore } from '../core/store.js';
import { acquireLock } from '../core/lock.js';
import * as output from '../output.js';
import { formatBytes } from '../utils.js';

export async function pruneCommand(options = {}) {
  const s = output.spinner('Scanning store references...');

  const orphaned = getOrphanedPackages();

  if (orphaned.length === 0) {
    output.success('Store is clean — no unreferenced packages');
    return;
  }

  const totalSize = orphaned.reduce((sum, pkg) => sum + (pkg.size_bytes || 0), 0);
  output.success(`Found ${orphaned.length} unreferenced package${orphaned.length === 1 ? '' : 's'} (${formatBytes(totalSize)})`);

  if (!options.force) {
    console.log();
    output.table(
      ['Package', 'Version', 'Size'],
      orphaned.map(pkg => [
        pkg.name,
        pkg.version,
        formatBytes(pkg.size_bytes || 0),
      ])
    );
    console.log();

    const confirmed = await confirm(`Remove ${orphaned.length} unreferenced package(s)?`);
    if (!confirmed) {
      output.info('Cancelled');
      return;
    }
  }

  let lock;
  try {
    lock = acquireLock();
  } catch (err) {
    output.error(err.message);
    return;
  }

  let removed = 0;
  let freedBytes = 0;

  try {
  for (const pkg of orphaned) {
    try {
      removeFromStore(pkg.name, pkg.version);
      deletePackage(pkg.name, pkg.version);
      freedBytes += pkg.size_bytes || 0;
      removed++;
    } catch (err) {
      output.error(`Failed to remove ${pkg.name}@${pkg.version}: ${err.message}`);
    }
  }

  console.log();
  output.success(`Pruned ${removed} package${removed === 1 ? '' : 's'} (${formatBytes(freedBytes)} freed)`);
  console.log();
  } finally {
    lock.release();
  }
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} (y/n) `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
