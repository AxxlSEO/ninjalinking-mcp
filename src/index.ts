#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { NinjalinkingApiClient } from './api-client.js';

// Load environment variables
dotenv.config();

const API_URL = process.env.GOUDO_API_URL;
const API_TOKEN = process.env.GOUDO_API_TOKEN;

if (!API_URL || !API_TOKEN) {
  console.error('[ERROR] Missing required environment variables: GOUDO_API_URL and GOUDO_API_TOKEN');
  console.error('[ERROR] Please create a .env file based on .env.example');
  process.exit(1);
}

// Initialize API client
const apiClient = new NinjalinkingApiClient(API_URL, API_TOKEN);

// Create MCP server
const server = new Server(
  {
    name: 'ninjalinking-mcp-orders',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.error('[MCP] Listing resources');
  return {
    resources: [
      {
        uri: 'orders://pending',
        name: 'Pending Orders',
        description: 'List all paid orders waiting to be processed',
        mimeType: 'application/json',
      },
      {
        uri: 'orders://links/pending',
        name: 'Pending Links',
        description: 'List all links waiting to be completed',
        mimeType: 'application/json',
      },
      {
        uri: 'orders://{id}/details',
        name: 'Order Details',
        description: 'Get detailed information about a specific order (use orders://123/details)',
        mimeType: 'application/json',
      },
    ],
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  console.error(`[MCP] Reading resource: ${uri}`);

  try {
    // Handle orders://pending
    if (uri === 'orders://pending') {
      const response = await apiClient.getPendingOrders();
      if (response.error) {
        throw new McpError(ErrorCode.InternalError, response.error);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    }

    // Handle orders://links/pending
    if (uri === 'orders://links/pending') {
      const response = await apiClient.getPendingLinks();
      if (response.error) {
        throw new McpError(ErrorCode.InternalError, response.error);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    }

    // Handle orders://{id}/details
    const orderIdMatch = uri.match(/^orders:\/\/(\d+)\/details$/);
    if (orderIdMatch) {
      const orderId = parseInt(orderIdMatch[1], 10);
      const response = await apiClient.getOrderDetails(orderId);
      if (response.error) {
        throw new McpError(ErrorCode.InternalError, response.error);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    }

    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MCP] Error reading resource: ${errorMessage}`);
    throw new McpError(ErrorCode.InternalError, errorMessage);
  }
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[MCP] Listing tools');
  return {
    tools: [
      {
        name: 'complete_link',
        description: 'Mark a link as completed with forum details',
        inputSchema: {
          type: 'object',
          properties: {
            link_id: {
              type: 'number',
              description: 'The ID of the link to complete',
            },
            forum_url: {
              type: 'string',
              description: 'The URL of the forum post where the link was published',
            },
            anchor_used: {
              type: 'string',
              description: 'The anchor text used for the link',
            },
            forum_domain: {
              type: 'string',
              description: 'The domain of the forum (optional)',
            },
            notes: {
              type: 'string',
              description: 'Additional notes about the completion (optional)',
            },
          },
          required: ['link_id', 'forum_url', 'anchor_used'],
        },
      },
      {
        name: 'update_link_step',
        description: 'Update the work step/status of a link',
        inputSchema: {
          type: 'object',
          properties: {
            link_id: {
              type: 'number',
              description: 'The ID of the link to update',
            },
            work_step: {
              type: 'string',
              description: 'The new work step/status for the link',
            },
          },
          required: ['link_id', 'work_step'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));

  try {
    switch (name) {
      case 'complete_link': {
        const { link_id, forum_url, anchor_used, forum_domain, notes } = args as any;

        if (!link_id || !forum_url || !anchor_used) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameters: link_id, forum_url, anchor_used'
          );
        }

        const response = await apiClient.completeLink({
          link_id: Number(link_id),
          forum_url,
          anchor_used,
          forum_domain,
          notes,
        });

        if (response.error) {
          throw new McpError(ErrorCode.InternalError, response.error);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Link completed successfully',
                  data: response.data,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'update_link_step': {
        const { link_id, work_step } = args as any;

        if (!link_id || !work_step) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameters: link_id, work_step'
          );
        }

        const response = await apiClient.updateLinkStep({
          link_id: Number(link_id),
          work_step,
        });

        if (response.error) {
          throw new McpError(ErrorCode.InternalError, response.error);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Link work step updated successfully',
                  data: response.data,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MCP] Error executing tool: ${errorMessage}`);
    throw new McpError(ErrorCode.InternalError, errorMessage);
  }
});

// Start server
async function main() {
  console.error('[MCP] Starting Ninjalinking Orders MCP Server...');
  console.error(`[MCP] API URL: ${API_URL}`);
  console.error('[MCP] Server ready');

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[FATAL] Server error:', error);
  process.exit(1);
});
