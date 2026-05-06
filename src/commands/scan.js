import path from 'node:path';
import { expandPath, loadConfig } from '../config.js';
import { scanDirectory } from '../core/scanner.js';
import { indexProject } from '../core/indexer.js';
import { upsertProject, getProjectByPath } from '../db/database.js';
import * as output from '../output.js';
import { emitProgress } from '../output.js';
import { formatBytes, shortenPath } from '../utils.js';

export function scanCommand(targetPath, options = {}) {
  const resolvedPath = expandPath(targetPath || '.');

  const s = output.spinner(`Scanning ${shortenPath(resolvedPath, 64)}...`);

  const projects = scanDirectory(resolvedPath, { depth: options.depth });

  if (projects.length === 0) {
    output.warn(`No Node.js projects found in ${resolvedPath}`);
    return;
  }

  output.success(`Found ${projects.length} project${projects.length === 1 ? '' : 's'}`);
  console.log();

  // Persist to database
  const s2 = output.spinner('Indexing packages...');
  let totalSize = 0;
  let totalPackages = 0;
  const pmCounts = { npm: 0, yarn: 0, pnpm: 0 };
  const statusCounts = { active: 0, stale: 0, archived: 0 };
  const packageCounts = new Map();

  for (let pi = 0; pi < projects.length; pi++) {
    const project = projects[pi];
    emitProgress(`Indexing ${project.name}`, pi + 1, projects.length);
    const result = upsertProject(project);
    const dbProject = getProjectByPath(project.path);

    // Index packages for this project (read-only — no DB inserts until link)
    const packages = indexProject(project.path);
    for (const pkg of packages) {
      const key = `${pkg.name}@${pkg.version}`;
      packageCounts.set(key, (packageCounts.get(key) || 0) + 1);
    }

    totalSize += project.totalSizeBytes;
    totalPackages += packages.length;
    pmCounts[project.packageManager]++;
    statusCounts[project.status]++;
  }

  // Calculate duplicates
  let duplicatePackages = 0;
  for (const [, count] of packageCounts) {
    if (count > 1) duplicatePackages += count - 1;
  }
  const duplicatePercentage = totalPackages > 0
    ? Math.round((duplicatePackages / totalPackages) * 100)
    : 0;

  output.success('Indexing complete');
  console.log();

  // Summary
  output.heading('Scan Results');
  console.log();

  const pmParts = [];
  if (pmCounts.npm > 0) pmParts.push(`${pmCounts.npm} npm`);
  if (pmCounts.yarn > 0) pmParts.push(`${pmCounts.yarn} yarn`);
  if (pmCounts.pnpm > 0) pmParts.push(`${pmCounts.pnpm} pnpm`);
  output.info(`Projects: ${projects.length} (${pmParts.join(', ')})`);
  output.info(`Total node_modules: ${formatBytes(totalSize)}`);
  output.info(`Unique packages: ${packageCounts.size}`);
  output.info(`Duplicate packages: ${duplicatePackages} (${duplicatePercentage}%)`);
  console.log();

  // Status breakdown
  if (statusCounts.stale > 0 || statusCounts.archived > 0) {
    output.info(`Active: ${statusCounts.active} | Stale: ${statusCounts.stale} | Archived: ${statusCounts.archived}`);
  }

  // pnpm warning
  const pnpmProjects = projects.filter(p => p.pnpmVirtualStore);
  if (pnpmProjects.length > 0) {
    console.log();
    output.warn(`${pnpmProjects.length} pnpm project(s) use virtual stores — linking skipped for these`);
  }

  // Project table
  console.log();
  output.table(
    ['Name', 'PM', 'Size', 'Status', 'Path'],
    projects.map(p => [
      p.name,
      p.packageManager,
      formatBytes(p.totalSizeBytes),
      p.status,
      p.path,
    ])
  );
  console.log();
}
