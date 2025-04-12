/**
 * Version information for the Glean MCP Server
 * Automatically synchronized with the version in package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Read package.json to get the current version
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
let packageVersion = '0.0.0';

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  packageVersion = packageJson.version || '0.0.0';
} catch (error) {
  console.warn('Could not read package.json version, using default', error);
}

export const VERSION = packageVersion;
