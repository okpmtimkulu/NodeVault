import fs from 'node:fs';
import { loadConfig, saveConfig, configExists, paths } from '../config.js';
import { getDb } from '../db/database.js';
import * as output from '../output.js';

export async function initCommand() {
  if (configExists()) {
    output.warn('NodeVault is already initialized');
    output.info(`Config: ${paths.configPath}`);
    output.info(`Store: ${paths.storePath}`);
    return;
  }

  const s = output.spinner('Initializing NodeVault...');

  // Create store directory
  fs.mkdirSync(paths.storePath, { recursive: true });
  fs.mkdirSync(paths.stagingPath, { recursive: true });

  // Write default config
  const config = loadConfig();
  saveConfig(config);

  // Initialize database
  getDb();

  output.success('NodeVault initialized');
  output.info(`Store:  ${paths.storePath}`);
  output.info(`Config: ${paths.configPath}`);
  output.info(`DB:     ${paths.dbPath}`);
  console.log();
  output.dim('Next: run `nodevault scan <directory>` to find projects');
}
