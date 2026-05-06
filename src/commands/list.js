import { getAllProjects } from '../db/database.js';
import * as output from '../output.js';
import { formatBytes, relativeTime } from '../utils.js';

export function listCommand(options = {}) {
  let projects = getAllProjects();

  if (projects.length === 0) {
    output.warn('No tracked projects. Run `nodevault scan` first.');
    return;
  }

  // Filter
  if (options.filter) {
    const filter = options.filter.toLowerCase();
    if (['active', 'stale', 'archived'].includes(filter)) {
      projects = projects.filter(p => p.status === filter);
    } else if (['npm', 'yarn', 'pnpm'].includes(filter)) {
      projects = projects.filter(p => p.package_manager === filter);
    } else if (filter === 'linked') {
      projects = projects.filter(p => p.linked);
    } else if (filter === 'unlinked') {
      projects = projects.filter(p => !p.linked);
    }
  }

  // Sort
  if (options.sort) {
    switch (options.sort) {
      case 'size':
        projects.sort((a, b) => (b.total_size_bytes || 0) - (a.total_size_bytes || 0));
        break;
      case 'accessed':
        projects.sort((a, b) => (b.last_accessed_at || 0) - (a.last_accessed_at || 0));
        break;
      case 'name':
        projects.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'status':
        const order = { archived: 0, stale: 1, active: 2 };
        projects.sort((a, b) => order[a.status] - order[b.status]);
        break;
    }
  }

  if (projects.length === 0) {
    output.info('No projects match the filter');
    return;
  }

  console.log();
  output.table(
    ['Name', 'PM', 'Size', 'Saved', 'Status', 'Linked', 'Last Active', 'Path'],
    projects.map(p => [
      p.name,
      p.package_manager,
      formatBytes(p.total_size_bytes || 0),
      p.saved_bytes > 0 ? formatBytes(p.saved_bytes) : '-',
      p.status,
      p.linked ? 'yes' : 'no',
      p.last_accessed_at ? relativeTime(p.last_accessed_at) : '-',
      p.path,
    ])
  );
  console.log();
  output.dim(`  ${projects.length} project${projects.length === 1 ? '' : 's'}`);
  console.log();
}
