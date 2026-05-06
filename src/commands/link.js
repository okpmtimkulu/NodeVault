import fs from 'node:fs';
import path from 'node:path';
import { expandPath } from '../config.js';
import { indexProject } from '../core/indexer.js';
import { addToStore, getStorePath, ensureStoreExists } from '../core/store.js';
import { acquireLock } from '../core/lock.js';
import { determineLinkStrategy, linkPackageToProject } from '../core/linker.js';
import {
  getAllProjects, getProjectByPath, updateProjectLinked,
  setLinkInProgress, linkProjectPackage, clearProjectPackages,
} from '../db/database.js';
import * as output from '../output.js';
import { emitProgress } from '../output.js';
import { formatBytes, dirSize } from '../utils.js';

export function linkCommand(target, options = {}) {
  let lock;
  try {
    lock = acquireLock();
  } catch (err) {
    output.error(err.message);
    return;
  }

  try {
  ensureStoreExists();

  let projects;

  if (options.paths && options.paths.length > 0) {
    projects = [];
    for (const raw of options.paths) {
      const p = String(raw).trim();
      if (!p) continue;
      const resolvedPath = expandPath(p);
      const project = getProjectByPath(resolvedPath);
      if (!project) {
        output.warn(`Skipping — not in vault DB (scan first): ${resolvedPath}`);
        continue;
      }
      projects.push(project);
    }
    if (projects.length === 0) {
      output.warn('No matching tracked projects. Run `nodevault scan` on those folders first.');
      return;
    }
  } else if (options.all) {
    projects = getAllProjects();
    if (projects.length === 0) {
      output.warn('No tracked projects. Run `nodevault scan` first.');
      return;
    }
  } else if (target) {
    const resolvedPath = expandPath(target);
    const project = getProjectByPath(resolvedPath);
    if (!project) {
      output.error(`Project not found: ${resolvedPath}`);
      output.info('Run `nodevault scan` to discover projects first.');
      return;
    }
    projects = [project];
  } else {
    output.error('Specify a project path or use --all');
    return;
  }

  const strategy = options.strategy || null;
  let totalLinked = 0;
  let totalSaved = 0;
  let totalSkipped = 0;

  for (const project of projects) {
    // Skip pnpm virtual stores
    if (project.package_manager === 'pnpm') {
      const pnpmDir = path.join(project.path, 'node_modules', '.pnpm');
      if (fs.existsSync(pnpmDir)) {
        output.warn(`Skipping pnpm project: ${project.name} (virtual store not supported)`);
        totalSkipped++;
        continue;
      }
    }

    if (project.linked) {
      output.info(`Already linked: ${project.name}`);
      continue;
    }

    const s = output.spinner(`Linking ${project.name}...`);
    const projectStrategy = strategy || determineLinkStrategy(project.path);

    setLinkInProgress(project.path, true);

    try {
      const packages = indexProject(project.path);
      const nodeModulesPath = path.join(project.path, 'node_modules');
      let savedBytes = 0;
      let linkedCount = 0;

      // Clear and rebuild package relationships
      clearProjectPackages(project.id);

      const linkablePackages = packages.filter((p) => !p.native);
      const totalPkgs = linkablePackages.length;

      for (const pkg of linkablePackages) {
        linkedCount++;
        emitProgress(`Linking ${project.name}`, linkedCount, totalPkgs);

        // Add to store (copies if not present)
        const { storePath, alreadyExisted } = addToStore(pkg.name, pkg.version, pkg.resolvedPath);

        // Link from store to project
        linkPackageToProject(storePath, nodeModulesPath, pkg.name, projectStrategy);

        // Track relationship
        linkProjectPackage(project.id, pkg.name, pkg.version);

        if (alreadyExisted) {
          // This was a duplicate — we saved its full size
          savedBytes += dirSize(storePath);
        }
      }

      updateProjectLinked(project.path, true, projectStrategy, savedBytes);
      setLinkInProgress(project.path, false);

      totalLinked++;
      totalSaved += savedBytes;
      output.success(`Linked ${project.name}: ${linkedCount} packages (saved ${formatBytes(savedBytes)})`);
    } catch (err) {
      setLinkInProgress(project.path, false);
      output.error(`Failed to link ${project.name}: ${err.message}`);
    }
  }

  console.log();
  output.heading('Link Summary');
  output.info(`Projects linked: ${totalLinked}`);
  if (totalSkipped > 0) output.info(`Projects skipped: ${totalSkipped}`);
  output.info(`Disk recovered: ${formatBytes(totalSaved)}`);
  console.log();
  } finally {
    lock.release();
  }
}
