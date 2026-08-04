import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { NinjalinkingApiClient } from './api-client.js';
import type { ApiResult } from './types.js';
import {
  commitFields,
  delegationPayload,
  emptyInput,
  orderPayload,
  orderStatus,
  pageSize,
  toolOutput,
} from './schemas.js';

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const preview = { ...readOnly, openWorldHint: true };
const commit = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

export function createServer(api: NinjalinkingApiClient): McpServer {
  const server = new McpServer({ name: 'ninjalinking-mcp', version: '2.3.0' });

  register(server, 'get_profile', {
    description: 'Return the minimal NinjaLinking profile: id, name, role, and credit balance.',
    inputSchema: emptyInput,
    annotations: readOnly,
  }, () => api.getProfile());

  register(server, 'get_credits', {
    description: 'Return the current NinjaLinking credit balance.',
    inputSchema: emptyInput,
    annotations: readOnly,
  }, () => api.getCredits());

  register(server, 'get_credit_history', {
    description: 'List credit movements without Stripe identifiers or internal metadata.',
    inputSchema: z.object({ page_size: pageSize.optional() }),
    annotations: readOnly,
  }, args => api.getCreditHistory(args.page_size));

  register(server, 'get_available_packs', {
    description: 'List public NinjaLinking credit packs and prices.',
    inputSchema: emptyInput,
    annotations: readOnly,
  }, () => api.getAvailablePacks());

  register(server, 'list_orders', {
    description: 'List accessible backlink orders using bounded pagination.',
    inputSchema: z.object({
      status: orderStatus.optional(),
      search: z.string().max(255).optional(),
      page_size: pageSize.optional(),
    }),
    annotations: readOnly,
  }, args => api.listOrders({ status: args.status, search: args.search, pageSize: args.page_size }));

  register(server, 'get_order', {
    description: 'Return one accessible order and its minimal link details.',
    inputSchema: z.object({ order_id: z.string().uuid() }),
    annotations: readOnly,
  }, args => api.getOrder(args.order_id));

  register(server, 'get_link', {
    description: 'Return one accessible backlink without internal relations or comments.',
    inputSchema: z.object({ link_id: z.string().uuid() }),
    annotations: readOnly,
  }, args => api.getLink(args.link_id));

  register(server, 'preview_order', {
    description: 'Preview the exact credit impact of an order. Call this before create_order and show the preview to the user. Links may carry an optional due_date (YYYY-MM-DD): a hard "delivered no later than" deadline, at least 3 days out — tight deadlines are flagged in due_date_warnings.',
    inputSchema: orderPayload,
    annotations: preview,
  }, args => api.previewOrder(args));

  register(server, 'create_order', {
    description: 'Commit a previously previewed order. Use the unchanged payload, confirmation token, and a stable idempotency key. This may spend credits. Optional per-link due_date (YYYY-MM-DD) is a "delivered no later than" deadline (server enforces a minimum lead time).',
    inputSchema: orderPayload.extend(commitFields),
    annotations: commit,
  }, args => api.createOrder(args));

  register(server, 'preview_order_payment', {
    description: 'Preview the credits needed to pay an unpaid order. Show this result before pay_order.',
    inputSchema: z.object({ order_id: z.string().uuid() }),
    annotations: preview,
  }, args => api.previewPayment(args.order_id));

  register(server, 'pay_order', {
    description: 'Pay an order from a previous payment preview. This spends credits and is replay-safe.',
    inputSchema: z.object({ order_id: z.string().uuid(), ...commitFields }),
    annotations: commit,
  }, args => api.payOrder(args.order_id, args.confirmation_token, args.idempotency_key));

  register(server, 'list_delegations', {
    description: 'List accessible managed backlink campaigns using bounded pagination.',
    inputSchema: z.object({
      payment_mode: z.enum(['onetime', 'monthly']).optional(),
      page_size: pageSize.optional(),
    }),
    annotations: readOnly,
  }, args => api.listDelegations({ paymentMode: args.payment_mode, pageSize: args.page_size }));

  register(server, 'get_delegation', {
    description: 'Return one managed campaign without Stripe or payment internals.',
    inputSchema: z.object({ delegation_id: z.string().uuid() }),
    annotations: readOnly,
  }, args => api.getDelegation(args.delegation_id));

  register(server, 'preview_delegation', {
    description: 'Preview the server-calculated EUR price of a managed campaign before checkout creation.',
    inputSchema: delegationPayload,
    annotations: preview,
  }, args => api.previewDelegation(args));

  register(server, 'create_delegation', {
    description: 'Create Stripe checkout for a previously previewed managed campaign. Use an unchanged payload and stable idempotency key.',
    inputSchema: delegationPayload.extend(commitFields),
    annotations: commit,
  }, args => api.createDelegation(args));

  return server;
}

function register<Schema extends z.ZodType>(
  server: McpServer,
  name: string,
  config: {
    description: string;
    inputSchema: Schema;
    annotations: typeof readOnly;
  },
  handler: (args: z.output<Schema>) => Promise<ApiResult<unknown>>,
) {
  const callback = async (args: unknown): Promise<CallToolResult> => {
    const started = Date.now();
    const correlationId = crypto.randomUUID();
    try {
      const result = await handler(args as z.output<Schema>);
      const output = result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: {
            status: result.status,
            code: result.code,
            message: result.message,
            retryable: result.retryable,
            ...(result.details === undefined ? {} : { details: result.details }),
          } };
      console.error(JSON.stringify({ event: 'tool_call', tool: name, correlation_id: correlationId, duration_ms: Date.now() - started, ok: result.ok, code: result.ok ? undefined : result.code }));
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
        isError: !result.ok,
      };
    } catch (error) {
      console.error(JSON.stringify({ event: 'tool_call', tool: name, correlation_id: correlationId, duration_ms: Date.now() - started, ok: false, code: 'internal_error' }));
      const output = { ok: false, error: { status: 0, code: 'internal_error', message: error instanceof Error ? error.message : 'Unexpected tool error.', retryable: false } };
      return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output, isError: true };
    }
  };

  // The SDK's Zod v4 conditional type cannot preserve a generic schema's
  // output through this registration helper. Runtime input/output validation
  // is still performed by McpServer with the concrete schemas above.
  server.registerTool(name, { ...config, outputSchema: toolOutput }, callback as never);
}
