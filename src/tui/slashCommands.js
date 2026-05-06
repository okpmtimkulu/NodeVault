/** Slash palette entries (Claude-style / typeahead). `name` is without leading slash. */
export const SLASH_COMMANDS = [
  { name: 'init', description: 'Create store, config, and database' },
  { name: 'status', description: 'Store health and project overview' },
  { name: 'scan-dir', description: 'Scan a specific folder — paste or type path, Enter' },
  { name: 'link-paste', description: 'Link only chosen projects — paste paths, one per line, Ctrl+S' },
  { name: 'scan', description: 'Discover projects (optional path after command)' },
  { name: 'link', description: 'Link to store — add path or use link --all from CLI' },
  { name: 'list', description: 'List tracked projects' },
  { name: 'clean', description: 'Remove node_modules from stale/archived' },
  { name: 'prune', description: 'Remove unreferenced packages from store' },
  { name: 'daemon', description: 'Daemon — pass start|stop|status|logs after command' },
  { name: 'watch', description: 'Watch directory for new projects' },
  { name: 'unlink', description: 'Restore project node_modules (path required)' },
];

export function filterSlashCommands(line) {
  if (!line.startsWith('/')) return [];
  const token = line.slice(1).split(/\s+/)[0] ?? '';
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(token));
}
