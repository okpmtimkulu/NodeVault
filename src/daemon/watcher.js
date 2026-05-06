import { watch } from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from '../config.js';
import { scanDirectory } from '../core/scanner.js';
import { indexProject } from '../core/indexer.js';
import { addToStore } from '../core/store.js';
import { determineLinkStrategy, linkPackageToProject } from '../core/linker.js';
import {
  upsertProject, getProjectByPath, clearProjectPackages,
  linkProjectPackage, updateProjectLinked, setLinkInProgress,
} from '../db/database.js';
import { acquireLock } from '../core/lock.js';
import { dirSize, formatBytes } from '../utils.js';

const debounceTimers = new Map();
const DEBOUNCE_MS = 3000;

export function createWatcher(dirs, options = {}) {
  const config = loadConfig();
  const watchPaths = dirs.map(d => path.join(d, '**', 'node_modules'));
  const log = options.log || console.log;

  const watcher = watch(watchPaths, {
    depth: config.scanDepth,
    ignoreInitial: true,
    ignored: [
      '**/node_modules/**/node_modules/**',
      '**/.git/**',
    ],
    persistent: true,
  });

  watcher.on('addDir', (dirPath) => {
    // We're looking for node_modules directories being created
    if (!dirPath.endsWith('node_modules')) return;

    const projectRoot = path.dirname(dirPath);
    debounceProject(projectRoot, log, config);
  });

  watcher.on('error', (err) => {
    log(`Watcher error: ${err.message}`);
  });

  return watcher;
}

function debounceProject(projectRoot, log, config) {
  // Clear existing timer for this project
  if (debounceTimers.has(projectRoot)) {
    clearTimeout(debounceTimers.get(projectRoot));
  }

  debounceTimers.set(projectRoot, setTimeout(() => {
    debounceTimers.delete(projectRoot);
    handleNewProject(projectRoot, log, config);
  }, DEBOUNCE_MS));
}

async function handleNewProject(projectRoot, log, config) {
  try {
    // Check if this is a valid Node project
    if (!fs.existsSync(path.join(projectRoot, 'package.json'))) return;
    if (!fs.existsSync(path.join(projectRoot, 'node_modules'))) return;

    const timestamp = new Date().toLocaleTimeString();
    log(`[${timestamp}] Detected: ${projectRoot}`);

    // Scan this single project
    const projects = scanDirectory(projectRoot, { depth: 0 });
    if (projects.length === 0) return;

    const project = projects[0];
    upsertProject(project);

    if (!config.autoLink) {
      log(`[${timestamp}] Tracked: ${project.name}`);
      return;
    }

    // Acquire lock before modifying store/node_modules
    let lock;
    try {
      lock = acquireLock();
    } catch (err) {
      log(`[${timestamp}] Skipping auto-link for ${project.name}: ${err.message}`);
      return;
    }

    try {
      // Auto-link
      const dbProject = getProjectByPath(project.path);
      if (!dbProject) return;

      const packages = indexProject(project.path);
      const strategy = determineLinkStrategy(project.path);
      const nodeModulesPath = path.join(project.path, 'node_modules');

      setLinkInProgress(project.path, true);
      clearProjectPackages(dbProject.id);

      let savedBytes = 0;
      let linkedCount = 0;

      for (const pkg of packages) {
        if (pkg.native) continue;

        try {
          const { storePath, alreadyExisted } = addToStore(pkg.name, pkg.version, pkg.resolvedPath);
          linkPackageToProject(storePath, nodeModulesPath, pkg.name, strategy);
          linkProjectPackage(dbProject.id, pkg.name, pkg.version);

          if (alreadyExisted) {
            savedBytes += dirSize(storePath);
          }
          linkedCount++;
        } catch (err) {
          log(`  Warning: could not link ${pkg.name}@${pkg.version}: ${err.message}`);
        }
      }

      updateProjectLinked(project.path, true, strategy, savedBytes);
      setLinkInProgress(project.path, false);

      log(`[${timestamp}] Linked: ${project.name} → ${linkedCount} packages (saved ${formatBytes(savedBytes)})`);
    } finally {
      lock.release();
    }
  } catch (err) {
    log(`Error processing ${projectRoot}: ${err.message}`);
  }
}
