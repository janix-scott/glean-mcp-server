#!/usr/bin/env node
/**
 * @fileoverview Glean Model Context Protocol (MCP) Server Entry Point
 *
 * This is the main entry point for the @gleanwork/mcp-server package.
 * It branches between two main functionalities:
 *
 * 1. Running as an MCP server (default behavior)
 * 2. Configuring MCP settings for different hosts (when run with 'configure' argument)
 *
 * @module @gleanwork/mcp-server
 */

import meow from 'meow';
import { runServer } from './server.js';
import { configure, listSupportedClients } from './configure.js';
import { availableClients, ensureClientsLoaded } from './configure/index.js';
import { VERSION } from './common/version.js';

/**
 * Main function to handle command line arguments and branch between server and configure modes
 */
async function main() {
  // Pre-load clients before generating help text
  try {
    await ensureClientsLoaded();
  } catch {
    console.error(
      'Warning: Failed to load client modules. Help text may be incomplete.',
    );
  }

  // Get the list of available clients
  const clientList = Object.keys(availableClients).join(', ');

  const cli = meow(
    `
    Usage
      Typically this package is configured in an MCP client configuration file.
      However, you can also run it directly with the following commands, which help you set up the server configuration in an MCP client:

      $ npx @gleanwork/mcp-server configure --client <client-name> [options]

    Commands
      configure   Configure MCP settings for a specific client/host
      help        Show this help message

    Options for configure
      --client, -c   MCP client to configure for (${clientList || 'loading available clients...'})
      --token, -t    Glean API token
      --domain, -d   Glean instance domain/subdomain
      --env, -e      Path to .env file containing GLEAN_API_TOKEN and GLEAN_SUBDOMAIN

    Examples
      $ npx @gleanwork/mcp-server
      $ npx @gleanwork/mcp-server configure --client cursor --token glean_api_xyz --domain my-company
      $ npx @gleanwork/mcp-server configure --client claude --env ~/.env.glean

    Run 'npx @gleanwork/mcp-server help' for more details on supported clients
    
    Version: v${VERSION}
  `,
    {
      importMeta: import.meta,
      flags: {
        client: {
          type: 'string',
          shortFlag: 'c',
        },
        token: {
          type: 'string',
          shortFlag: 't',
        },
        domain: {
          type: 'string',
          shortFlag: 'd',
        },
        env: {
          type: 'string',
          shortFlag: 'e',
        },
        help: {
          type: 'boolean',
          shortFlag: 'h',
        },
      },
    },
  );

  // If no input is provided, run the MCP server
  if (cli.input.length === 0) {
    runServer().catch((error) => {
      console.error('Error starting MCP server:', error);
      process.exit(1);
    });
    return;
  }

  // Handle command
  const command = cli.input[0].toLowerCase();

  switch (command) {
    case 'configure': {
      const { client, token, domain, env } = cli.flags;

      // Validate required parameters
      if (!client) {
        console.error('Error: --client parameter is required');
        console.error('Run with --help for usage information');

        // Show available clients
        await listSupportedClients();
        process.exit(1);
      }

      // Check if either (token & domain) or env is provided
      if ((!token || !domain) && !env) {
        console.error('Warning: Configuring without complete credentials.');
        console.error('You must provide either:');
        console.error('  1. Both --token and --domain, or');
        console.error(
          '  2. --env pointing to a .env file containing GLEAN_API_TOKEN and GLEAN_SUBDOMAIN',
        );
        console.error('');
        console.error(
          'Continuing with configuration, but you will need to set credentials manually later.',
        );
      }

      try {
        await configure(client, { token, domain, envPath: env });
      } catch (error: any) {
        console.error(`Configuration failed: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    // Keep 'install' as an alias for 'configure' for backward compatibility
    case 'install': {
      const { client, token, domain, env } = cli.flags;
      console.log(
        'Note: The "install" command is deprecated, please use "configure" instead.',
      );

      if (!client) {
        console.error('Error: --client parameter is required');
        console.error('Run with --help for usage information');
        await listSupportedClients();
        process.exit(1);
      }

      if ((!token || !domain) && !env) {
        console.error('Warning: Configuring without complete credentials.');
        console.error('You must provide either:');
        console.error('  1. Both --token and --domain, or');
        console.error(
          '  2. --env pointing to a .env file containing GLEAN_API_TOKEN and GLEAN_SUBDOMAIN',
        );
        console.error('');
        console.error(
          'Continuing with configuration, but you will need to set credentials manually later.',
        );
      }

      try {
        await configure(client, { token, domain, envPath: env });
      } catch (error: any) {
        console.error(`Configuration failed: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    case 'help': {
      console.log(cli.help);
      await listSupportedClients();
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Run with --help for usage information');
      process.exit(1);
    }
  }
}

// Run the main function and handle any fatal errors
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
