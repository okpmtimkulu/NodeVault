import fs from 'node:fs';
import { paths, loadConfig } from '../config.js';
import { getStats } from '../db/database.js';
import { getStoreSize, getStorePackageCount } from '../core/store.js';
import * as output from '../output.js';
import { formatBytes } from '../utils.js';

export async function statusCommand(options = {}) {
  if (!fs.existsSync(paths.configPath)) {
    output.error('NodeVault not initialized. Run `nodevault init` first.');
    return;
  }

  const stats = getStats();
  const storeSize = getStoreSize();
  const storePackages = getStorePackageCount();

  if (options.json) {
    console.log(JSON.stringify({
      store: {
        path: paths.storePath,
        size: storeSize,
        packages: storePackages,
      },
      projects: {
        total: stats.projectCount,
        active: stats.activeCount,
        stale: stats.staleCount,
        archived: stats.archivedCount,
        linked: stats.linkedCount,
      },
      disk: {
        totalNodeModules: stats.totalSizeBytes,
        saved: stats.savedBytes,
      },
    }, null, 2));
    return;
  }

  output.heading('NodeVault Status');
  console.log();

  output.info(`Store: ${paths.storePath} (${formatBytes(storeSize)})`);
  output.info(`Packages in store: ${storePackages}`);
  console.log();

  output.info(`Projects tracked: ${stats.projectCount}`);
  output.info(`Active: ${stats.activeCount} | Stale: ${stats.staleCount} | Archived: ${stats.archivedCount}`);
  output.info(`Linked: ${stats.linkedCount}`);
  console.log();

  output.info(`Total node_modules: ${formatBytes(stats.totalSizeBytes)}`);
  output.info(`Disk saved: ${formatBytes(stats.savedBytes)}`);

  if (options.verbose) {
    const config = loadConfig();
    console.log();
    output.heading('Configuration');
    output.info(`Link strategy: ${config.linkStrategy}`);
    output.info(`Scan depth: ${config.scanDepth}`);
    output.info(`Stale threshold: ${config.staleThresholdDays} days`);
    output.info(`Archive threshold: ${config.archiveThresholdDays} days`);
    output.info(`Watch dirs: ${config.watchDirs.length > 0 ? config.watchDirs.join(', ') : '(none)'}`);
  }

  console.log();
}
