import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockConsole } from 'console-test-helpers';
import { validateFlags } from '../index.js';

describe('validateFlags', () => {
  let resetConsole: () => void;
  let consoleState: any;

  beforeEach(() => {
    ({ resetConsole, consoleState } = mockConsole());
  });

  afterEach(() => {
    resetConsole();
  });

  it('should return false when client is not provided', async () => {
    const result = await validateFlags(undefined, 'token', 'domain', undefined);

    expect(result).toBe(false);
    expect(consoleState.getState('error')).toMatchInlineSnapshot(`
      "Error: --client parameter is required
      Run with --help for usage information"
    `);
  });

  it('should return false when both token/domain and env are provided', async () => {
    const result = await validateFlags('client', 'token', 'domain', 'env-path');

    expect(result).toBe(false);
    expect(consoleState.getState('error')).toMatchInlineSnapshot(`
      "Error: You must provide either --token and --domain OR --env, not both.
      Run with --help for usage information"
    `);
  });

  it('should return true but show warning when no credentials are provided', async () => {
    const result = await validateFlags(
      'client',
      undefined,
      undefined,
      undefined,
    );

    expect(result).toBe(true);
    expect(consoleState.getState('error')).toMatchInlineSnapshot(`
      "Warning: Configuring without complete credentials.
      You must provide either:
        1. Both --token and --domain, or
        2. --env pointing to a .env file containing GLEAN_API_TOKEN and GLEAN_SUBDOMAIN

      Continuing with configuration, but you will need to set credentials manually later."
    `);
  });

  it('should return true but show warning when only token is provided', async () => {
    const result = await validateFlags('client', 'token', undefined, undefined);

    expect(result).toBe(true);
    expect(consoleState.getState('error')).toMatchInlineSnapshot(`
      "Warning: Configuring without complete credentials.
      You must provide either:
        1. Both --token and --domain, or
        2. --env pointing to a .env file containing GLEAN_API_TOKEN and GLEAN_SUBDOMAIN

      Continuing with configuration, but you will need to set credentials manually later."
    `);
  });

  it('should return true but show warning when only domain is provided', async () => {
    const result = await validateFlags(
      'client',
      undefined,
      'domain',
      undefined,
    );

    expect(result).toBe(true);
    expect(consoleState.getState('error')).toMatchInlineSnapshot(`
      "Warning: Configuring without complete credentials.
      You must provide either:
        1. Both --token and --domain, or
        2. --env pointing to a .env file containing GLEAN_API_TOKEN and GLEAN_SUBDOMAIN

      Continuing with configuration, but you will need to set credentials manually later."
    `);
  });

  it('should return true when both token and domain are provided', async () => {
    const result = await validateFlags('client', 'token', 'domain', undefined);

    expect(result).toBe(true);
    expect(consoleState.getState('error')).toEqual('');
  });

  it('should return true when env path is provided', async () => {
    const result = await validateFlags(
      'client',
      undefined,
      undefined,
      'env-path',
    );

    expect(result).toBe(true);
    expect(consoleState.getState('error')).toEqual('');
  });
});
