import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';

function success(data) { return Promise.resolve({ ok: true, status: 200, data }); }

function fakeApi() {
  return {
    getProfile: () => success({ data: { id: 'u1', fullname: 'Axel', role: 'customer', credits: 4 } }),
    getCredits: () => success({ data: { credits: 4 } }),
    getCreditHistory: () => success({ data: { items: [] } }),
    getAvailablePacks: () => success({ data: { packs: [] } }),
    listOrders: () => success({ data: { items: [], page: 1, page_size: 25, total: 0, last_page: 1 } }),
    getOrder: () => success({ data: {} }),
    getLink: () => success({ data: {} }),
    previewOrder: () => success({ data: { credits_needed: 1, confirmation_token: 'x'.repeat(64) } }),
    createOrder: () => success({ data: { order: { id: 'o1' } } }),
    previewPayment: () => success({ data: { credits_needed: 1 } }),
    payOrder: () => success({ data: { order: { id: 'o1', status: 'paid' } } }),
    listDelegations: () => success({ data: { items: [] } }),
    getDelegation: () => success({ data: {} }),
    previewDelegation: () => success({ data: { total_price: 100 } }),
    createDelegation: () => success({ data: { checkout_url: 'https://checkout.stripe.com/test' } }),
  };
}

async function connected() {
  const server = createServer(fakeApi());
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

test('tool catalogue exposes impact annotations and preview/commit pairs', async () => {
  const { server, client } = await connected();
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 15);
    const read = tools.tools.find(tool => tool.name === 'get_profile');
    const preview = tools.tools.find(tool => tool.name === 'preview_order');
    const commit = tools.tools.find(tool => tool.name === 'create_order');
    assert.equal(read.annotations.readOnlyHint, true);
    assert.equal(preview.annotations.readOnlyHint, true);
    assert.equal(commit.annotations.readOnlyHint, false);
    assert.equal(commit.annotations.destructiveHint, true);
    assert.equal(commit.annotations.idempotentHint, true);
    assert.equal(commit.annotations.openWorldHint, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test('tool call returns structured content validated by the output schema', async () => {
  const { server, client } = await connected();
  try {
    const result = await client.callTool({ name: 'get_credits', arguments: {} });
    assert.deepEqual(result.structuredContent, { ok: true, data: { data: { credits: 4 } } });
    assert.equal(result.isError, false);
  } finally {
    await client.close();
    await server.close();
  }
});

test('Zod rejects unbounded pagination and impossible calendar months', async () => {
  const { server, client } = await connected();
  try {
    const page = await client.callTool({ name: 'list_orders', arguments: { page_size: 101 } });
    assert.equal(page.isError, true);
    const date = await client.callTool({
      name: 'preview_order',
      arguments: { links: [{ page_target: 'https://example.com', anchor_type: 'anchor', delivery_date: '2026-99' }] },
    });
    assert.equal(date.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
