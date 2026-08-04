#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { NinjalinkingApiClient } from './api-client.js';
import { createServer } from './server.js';

dotenv.config();

async function main() {
  const apiUrl = process.env.NINJALINKING_API_URL || 'https://app.linkontext.com';
  const apiToken = process.env.NINJALINKING_API_TOKEN || process.env.GOUDO_API_TOKEN || '';
  const api = new NinjalinkingApiClient(apiUrl, apiToken, {
    allowCustomHost: process.env.NINJALINKING_ALLOW_CUSTOM_HOST === 'true',
    legacyReadFallback: process.env.NINJALINKING_LEGACY_READ_FALLBACK !== 'false',
    legacyWriteFallback: process.env.NINJALINKING_LEGACY_WRITE_FALLBACK !== 'false',
  });
  await createServer(api).connect(new StdioServerTransport());
  console.error(JSON.stringify({ event: 'server_started', transport: 'stdio', version: '2.3.0' }));
}

main().catch(error => {
  console.error(JSON.stringify({ event: 'server_failed', code: 'startup_error', message: error instanceof Error ? error.message : 'Unknown startup error.' }));
  process.exit(1);
});
