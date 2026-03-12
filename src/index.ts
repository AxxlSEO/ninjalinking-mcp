#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { NinjalinkingApiClient } from './api-client.js';

dotenv.config();

const API_URL = process.env.NINJALINKING_API_URL || process.env.GOUDO_API_URL;
const API_TOKEN = process.env.NINJALINKING_API_TOKEN || process.env.GOUDO_API_TOKEN;

if (!API_URL || !API_TOKEN) {
  console.error('[ERROR] Missing NINJALINKING_API_URL and NINJALINKING_API_TOKEN');
  process.exit(1);
}

const api = new NinjalinkingApiClient(API_URL, API_TOKEN);

const server = new Server(
  { name: 'ninjalinking-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_profile',
    description:
      'Get my NinjaLinking account profile (name, email, credits balance, role)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_credits',
    description: 'Get my current credits balance',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_orders',
    description:
      'List my backlink orders. Can filter by status (unpaid, paid, pending, in_control, complete) and search by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Filter by status: unpaid, paid, pending, in_control, complete. Comma-separated for multiple.',
        },
        search: {
          type: 'string',
          description: 'Search in order number, label, page_target, anchor',
        },
        page_size: {
          type: 'number',
          description: 'Results per page (default 50, use -1 for all)',
        },
      },
    },
  },
  {
    name: 'get_order',
    description:
      'Get detailed information about a specific order including all its links and their statuses',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The UUID of the order',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'create_order',
    description:
      'Create a new backlink order. Each link costs 1 credit. If you have enough credits they are debited automatically; otherwise the order is created with status "unpaid". Each link entry needs: page_target (URL to link to), anchor_type (exact, partial, or generic). Optional: niche, delivery_date (YYYY-MM format), comment, qty (number of backlinks for this target, default 1).',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'A label/name for this order (optional)',
        },
        links: {
          type: 'array',
          description: 'Array of link specifications (max 55 total links)',
          items: {
            type: 'object',
            properties: {
              page_target: {
                type: 'string',
                description: 'The target URL that the backlink should point to',
              },
              anchor_type: {
                type: 'string',
                enum: ['exact', 'partial', 'generic'],
                description:
                  'Type of anchor text: exact (exact match keyword), partial (partial match), generic (generic/brand anchor)',
              },
              niche: {
                type: 'string',
                description: 'Topic/niche category for the backlink (optional)',
              },
              delivery_date: {
                type: 'string',
                description: 'Desired delivery month in YYYY-MM format (optional)',
              },
              comment: {
                type: 'string',
                description: 'Additional instructions or notes (optional)',
              },
              qty: {
                type: 'number',
                description:
                  'Number of backlinks to create for this target (default 1, max 55 total)',
              },
            },
            required: ['page_target', 'anchor_type'],
          },
        },
      },
      required: ['links'],
    },
  },
  {
    name: 'pay_order',
    description:
      'Pay an unpaid order using your credit balance. Debits the required credits (1 per link) and changes order status to "paid".',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The UUID of the unpaid order to pay',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'get_credit_history',
    description:
      'Get the history of all credit transactions (purchases and debits for orders)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_available_packs',
    description:
      'Get the list of available credit packs with prices (for purchasing credits)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_delegations',
    description:
      'List delegation orders (fully managed backlink campaigns). These are turnkey orders where NinjaLinking handles everything.',
    inputSchema: {
      type: 'object',
      properties: {
        payment_mode: {
          type: 'string',
          enum: ['onetime', 'monthly'],
          description: 'Filter by payment mode',
        },
        search: {
          type: 'string',
          description: 'Search in ref, site, details',
        },
        page_size: {
          type: 'number',
          description: 'Results per page (default 10)',
        },
      },
    },
  },
  {
    name: 'get_delegation',
    description: 'Get details of a specific delegation order',
    inputSchema: {
      type: 'object',
      properties: {
        delegation_id: {
          type: 'string',
          description: 'The UUID of the delegation order',
        },
      },
      required: ['delegation_id'],
    },
  },
  {
    name: 'create_delegation',
    description:
      'Create a new delegation order (fully managed backlink campaign). NinjaLinking handles everything. Returns a Stripe checkout URL for payment. Pricing is tiered based on quantity and payment mode.',
    inputSchema: {
      type: 'object',
      properties: {
        details: {
          type: 'string',
          description:
            'Description of the project, goals, and any specific requirements',
        },
        site: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of target site URLs',
        },
        qty: {
          type: 'number',
          description: 'Number of backlinks desired (max 199)',
        },
        budget: {
          type: 'number',
          description: 'Optional budget indication in euros',
        },
        payment_mode: {
          type: 'string',
          enum: ['onetime', 'monthly'],
          description:
            'Payment mode: onetime (single payment) or monthly (recurring subscription)',
        },
      },
      required: ['details', 'site', 'qty', 'payment_mode'],
    },
  },
  {
    name: 'get_link',
    description:
      'Get details of a specific backlink including its verification status and work step',
    inputSchema: {
      type: 'object',
      properties: {
        link_id: {
          type: 'string',
          description: 'The UUID of the link',
        },
      },
      required: ['link_id'],
    },
  },
];

// ── List tools ────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// ── Call tools ────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[MCP] Tool: ${name}`, JSON.stringify(args));

  const ok = (data: any) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });

  const fail = (error: string, suggestion?: string) => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { error, ...(suggestion ? { suggestion } : {}) },
          null,
          2
        ),
      },
    ],
    isError: true,
  });

  try {
    switch (name) {
      case 'get_profile': {
        const res = await api.getProfile();
        return res.error ? fail(res.error, 'Check that your API token is valid.') : ok(res.data);
      }

      case 'get_credits': {
        const res = await api.getCredits();
        return res.error ? fail(res.error) : ok(res.data);
      }

      case 'list_orders': {
        const a = args as any;
        const res = await api.listOrders({
          status: a?.status,
          search: a?.search,
          pageSize: a?.page_size,
        });
        return res.error ? fail(res.error) : ok(res.data);
      }

      case 'get_order': {
        const res = await api.getOrder((args as any).order_id);
        return res.error
          ? fail(res.error, 'Use list_orders to find valid order IDs.')
          : ok(res.data);
      }

      case 'create_order': {
        const a = args as any;
        // Pre-validate to give clear guidance
        if (!a.links || !Array.isArray(a.links) || a.links.length === 0) {
          return fail(
            'The "links" array is required and must contain at least one link.',
            'Each link needs: page_target (URL) and anchor_type (exact, partial, or generic).'
          );
        }
        const totalQty = a.links.reduce(
          (sum: number, l: any) => sum + (l.qty || 1),
          0
        );
        if (totalQty > 55) {
          return fail(
            `Total links requested (${totalQty}) exceeds the maximum of 55 per order.`,
            'Split into multiple orders or reduce the qty values.'
          );
        }
        const res = await api.createOrder({ label: a.label, links: a.links });
        if (res.error) {
          return fail(
            res.error,
            'Check that each link has a valid page_target (URL) and anchor_type (exact/partial/generic). delivery_date must be YYYY-MM format.'
          );
        }
        return ok(res.data);
      }

      case 'pay_order': {
        const res = await api.payOrder((args as any).order_id);
        if (res.error) {
          const suggestion = res.error.includes('déjà réglée')
            ? 'This order is already paid. Use get_order to check its current status.'
            : res.error.includes('introuvable')
              ? 'Order not found. Use list_orders to find valid order IDs.'
              : 'Use get_credits to check your balance, and get_available_packs to see credit purchase options.';
          return fail(res.error, suggestion);
        }
        return ok(res.data);
      }

      case 'get_credit_history': {
        const res = await api.getCreditHistory();
        return res.error ? fail(res.error) : ok(res.data);
      }

      case 'get_available_packs': {
        const res = await api.getAvailablePacks();
        return res.error ? fail(res.error) : ok(res.data);
      }

      case 'list_delegations': {
        const a = args as any;
        const res = await api.listDelegations({
          payment_mode: a?.payment_mode,
          search: a?.search,
          pageSize: a?.page_size,
        });
        return res.error ? fail(res.error) : ok(res.data);
      }

      case 'get_delegation': {
        const res = await api.getDelegation((args as any).delegation_id);
        return res.error
          ? fail(res.error, 'Use list_delegations to find valid delegation IDs.')
          : ok(res.data);
      }

      case 'create_delegation': {
        const a = args as any;
        if (a.qty > 199) {
          return fail(
            'Maximum 199 backlinks per delegation order. For larger volumes, contact NinjaLinking directly.',
            'Reduce qty to 199 or less.'
          );
        }
        const res = await api.createDelegation({
          details: a.details,
          site: a.site,
          qty: a.qty,
          budget: a.budget,
          payment_mode: a.payment_mode,
        });
        return res.error ? fail(res.error) : ok(res.data);
      }

      case 'get_link': {
        const res = await api.getLink((args as any).link_id);
        return res.error
          ? fail(res.error, 'Use get_order to list all links in an order.')
          : ok(res.data);
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MCP] Error: ${msg}`);
    return fail(msg, 'An unexpected error occurred. Try again or check your API configuration.');
  }
});

// ── Start ─────────────────────────────────────────────────────────

async function main() {
  console.error('[MCP] NinjaLinking MCP Server v2.0.0 starting...');
  console.error(`[MCP] API: ${API_URL}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Ready');
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
