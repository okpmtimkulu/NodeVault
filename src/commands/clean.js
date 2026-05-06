import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { getAllProjects, getProjectsByStatus, updateProjectLinked, updateProjectStatus, deleteProject } from '../db/database.js';
import { classifyProject } from '../core/lifecycle.js';
import { acquireLock } from '../core/lock.js';
import * as output from '../output.js';
import { formatBytes, rmrf, dirSize } from '../utils.js';

export async function cleanCommand(options = {}) {
  let projects;

  if (options.stale) {
    projects = getProjectsByStatus('stale');
  } else if (options.archived) {
    projects = getProjectsByStatus('archived');
  } else if (options.all) {
    projects = [...getProjectsByStatus('stale'), ...getProjectsByStatus('archived')];
  } else {
    // Interactive — show both stale and archived
    projects = [...getProjectsByStatus('stale'), ...getProjectsByStatus('archived')];
    if (projects.length === 0) {
      output.success('No stale or archived projects to clean');
      return;
    }

    console.log();
    output.heading('Projects eligible for cleanup');
    console.log();
    output.table(
      ['Name', 'Status', 'Size', 'Path'],
      projects.map(p => [
        p.name,
        p.status,
        formatBytes(p.total_size_bytes || 0),
        p.path,
      ])
    );
    console.log();

    if (!options.force) {
      const confirmed = await confirm(`Remove node_modules from ${projects.length} project(s)?`);
      if (!confirmed) {
        output.info('Cancelled');
        return;
      }
    }
  }

  // Re-classify projects so we don't delete node_modules from projects
  // that have become active since the last scan
  projects = projects.filter(project => {
    const currentStatus = classifyProject(project.path, project);
    if (currentStatus !== project.status) {
      updateProjectStatus(project.path, currentStatus);
      if (currentStatus === 'active') {
        output.info(`Skipping ${project.name} — now active (was ${project.status})`);
        return false;
      }
    }
    return true;
  });

  if (projects.length === 0) {
    output.success('No projects to clean');
    return;
  }

  if (!options.force && (options.stale || options.archived || options.all)) {
    const confirmed = await confirm(`Remove node_modules from ${projects.length} project(s)?`);
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

  let cleaned = 0;
  let freedBytes = 0;

  try {
  for (const project of projects) {
    const nodeModulesPath = path.join(project.path, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      output.dim(`  Skipped ${project.name} (no node_modules)`);
      continue;
    }

    const s = output.spinner(`Cleaning ${project.name}...`);
    try {
      const size = project.total_size_bytes || dirSize(nodeModulesPath);
      rmrf(nodeModulesPath);
      updateProjectLinked(project.path, false, null, 0);
      freedBytes += size;
      cleaned++;
      output.success(`Cleaned ${project.name} (${formatBytes(size)})`);
    } catch (err) {
      output.error(`Failed to clean ${project.name}: ${err.message}`);
    }
  }

  console.log();
  output.heading('Clean Summary');
  output.info(`Projects cleaned: ${cleaned}`);
  output.info(`Disk freed: ${formatBytes(freedBytes)}`);
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
