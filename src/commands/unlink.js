import path from 'node:path';
import { expandPath } from '../config.js';
import { getProjectByPath, updateProjectLinked } from '../db/database.js';
import { indexProject } from '../core/indexer.js';
import { getStorePath } from '../core/store.js';
import { unlinkPackageFromProject } from '../core/linker.js';
import { acquireLock } from '../core/lock.js';
import * as output from '../output.js';
import { formatBytes } from '../utils.js';

export function unlinkCommand(target) {
  if (!target) {
    output.error('Specify a project path to unlink');
    return;
  }

  const resolvedPath = expandPath(target);
  const project = getProjectByPath(resolvedPath);

  if (!project) {
    output.error(`Project not found: ${resolvedPath}`);
    output.info('Run `nodevault scan` to discover projects first.');
    return;
  }

  if (!project.linked) {
    output.info(`${project.name} is not linked`);
    return;
  }

  let lock;
  try {
    lock = acquireLock();
  } catch (err) {
    output.error(err.message);
    return;
  }

  const s = output.spinner(`Restoring independent node_modules for ${project.name}...`);

  try {
    const packages = indexProject(project.path);
    const nodeModulesPath = path.join(project.path, 'node_modules');
    let restoredCount = 0;

    for (const pkg of packages) {
      const storePath = getStorePath(pkg.name, pkg.version);
      try {
        unlinkPackageFromProject(storePath, nodeModulesPath, pkg.name);
        restoredCount++;
      } catch (err) {
        output.warn(`  Could not restore ${pkg.name}@${pkg.version}: ${err.message}`);
      }
    }

    updateProjectLinked(project.path, false, null, 0);
    output.success(`Restored ${restoredCount} packages for ${project.name}`);
    output.info('Project unlinked from store');
  } catch (err) {
    output.error(`Failed to unlink ${project.name}: ${err.message}`);
  } finally {
    lock.release();
  }

  console.log();
}
