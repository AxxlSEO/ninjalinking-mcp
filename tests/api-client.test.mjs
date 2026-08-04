import test from 'node:test';
import assert from 'node:assert/strict';
import { NinjalinkingApiClient, validateBaseUrl } from '../dist/api-client.js';

test('API URL policy requires HTTPS and an approved host', () => {
  assert.equal(validateBaseUrl('https://app.ninjalinking.fr/', false), 'https://app.ninjalinking.fr');
  assert.equal(validateBaseUrl('http://localhost:8000', false), 'http://localhost:8000');
  assert.throws(() => validateBaseUrl('http://app.ninjalinking.fr', false), /HTTPS/);
  assert.throws(() => validateBaseUrl('https://evil.example', false), /CUSTOM_HOST/i);
  assert.equal(validateBaseUrl('https://staging.example', true), 'https://staging.example');
});

test('GET retries transient errors and parses the final JSON response', async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    if (calls < 3) return new Response('{"error":"temporary"}', { status: 503 });
    return new Response('{"data":{"credits":7}}', { status: 200 });
  };
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.request('/health');
  assert.equal(calls, 3);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { data: { credits: 7 } });
});

test('POST is never retried and returns a typed error', async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response('{"error":{"code":"busy","message":"Try later","retryable":true}}', { status: 503 });
  };
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.request('/write', 'POST', { value: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: false, status: 503, code: 'busy', message: 'Try later', details: undefined, retryable: true });
});

test('non-JSON upstream responses become a useful typed error', async () => {
  const fetch = async () => new Response('<html>bad gateway</html>', { status: 200 });
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.request('/broken');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_json');
  assert.equal(result.retryable, true);
});

test('legacy read fallback strips PII and internal Stripe fields', async () => {
  const fetch = async url => {
    if (String(url).includes('/integrations/v1/profile')) {
      return new Response('{"message":"Forbidden"}', { status: 403 });
    }
    return new Response(JSON.stringify({ user: {
      id: 'u1', fullname: 'Axel', role: 'customer', credits: 4,
      email: 'private@example.com', stripe_customer_id: 'cus_secret', transfer_email: 'secret@example.com',
    } }), { status: 200 });
  };
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.getProfile();
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { data: { id: 'u1', fullname: 'Axel', role: 'customer', credits: 4 } });
  assert.equal(JSON.stringify(result).includes('cus_secret'), false);
  assert.equal(JSON.stringify(result).includes('private@example.com'), false);
});

const COMMIT = { confirmation_token: 'a'.repeat(64), idempotency_key: 'idem-12345' };

test('create_order falls back to legacy /api/orders when v1 is missing', async () => {
  let legacyBody;
  const fetch = async (url, init) => {
    if (String(url).includes('/integrations/v1/orders')) {
      return new Response('{"message":"Not Found"}', { status: 404 });
    }
    legacyBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      message: 'Commande validée et crédits débités.',
      order: { id: 'o1', label: 'Campagne', links: [{ id: 'l1', page_target: 'https://x.fr/', anchor_type: 'exact', due_date: '2026-09-15' }] },
      credit_left: 5,
    }), { status: 201 });
  };
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.createOrder({
    label: 'Campagne',
    links: [{ page_target: 'https://x.fr/', anchor_type: 'exact', due_date: '2026-09-15' }],
    ...COMMIT,
  });
  assert.equal(result.ok, true);
  assert.equal('confirmation_token' in legacyBody, false);
  assert.equal('idempotency_key' in legacyBody, false);
  assert.equal(legacyBody.label, 'Campagne');
  const data = result.data.data;
  assert.equal(data.legacy_fallback, true);
  assert.equal(data.payment_required, false);
  assert.equal(data.credits_remaining, 5);
  assert.equal(data.order.links[0].due_date, '2026-09-15');
});

test('create_order legacy fallback flags payment_required on insufficient credits', async () => {
  const fetch = async url => String(url).includes('/integrations/v1/')
    ? new Response('{"message":"Not Found"}', { status: 404 })
    : new Response(JSON.stringify({
        message: 'Commande enregistrée. Finalisez le paiement pour lancer le traitement.',
        order: { id: 'o1', label: '', links: [] },
        credit_left: 0,
      }), { status: 201 });
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.createOrder({ links: [{ page_target: 'https://x.fr/', anchor_type: 'exact' }], ...COMMIT });
  assert.equal(result.data.data.payment_required, true);
});

test('preview_order emulates the v1 preview on legacy servers', async () => {
  const tight = new Date();
  tight.setDate(tight.getDate() + 4);
  const tightDate = tight.toISOString().slice(0, 10);
  const fetch = async url => {
    if (String(url).includes('/integrations/v1/')) return new Response('{"message":"Not Found"}', { status: 404 });
    return new Response('{"credits":2}', { status: 200 });
  };
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.previewOrder({
    links: [
      { page_target: 'https://x.fr/', anchor_type: 'exact', qty: 2, due_date: tightDate },
      { page_target: 'https://y.fr/', anchor_type: 'exact' },
    ],
  });
  assert.equal(result.ok, true);
  const data = result.data.data;
  assert.equal(data.credits_needed, 3);
  assert.equal(data.credits_available, 2);
  assert.equal(data.payment_required, true);
  assert.equal(data.legacy_fallback, true);
  assert.equal(data.confirmation_token.length, 64);
  assert.equal(data.due_date_warnings.length, 1);
});

test('pay_order falls back to legacy /api/orders/{id}/pay (405 du catch-all SPA)', async () => {
  const calls = [];
  const fetch = async url => {
    calls.push(String(url));
    if (String(url).includes('/integrations/v1/')) return new Response('{"message":"Method Not Allowed"}', { status: 405 });
    return new Response(JSON.stringify({ message: 'Commande réglée, passage en validation.', order: { id: 'o1', status: 'pending' } }), { status: 200 });
  };
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const result = await client.payOrder('o1', COMMIT.confirmation_token, COMMIT.idempotency_key);
  assert.equal(result.ok, true);
  assert.equal(result.data.data.legacy_fallback, true);
  assert.equal(result.data.data.order.status, 'pending');
  assert.equal(calls.some(url => url.endsWith('/api/orders/o1/pay')), true);
});

test('write fallback can be disabled and other v1 errors pass through', async () => {
  const fetch = async url => String(url).includes('/integrations/v1/')
    ? new Response('{"error":{"code":"validation_failed","message":"bad"}}', { status: 422 })
    : new Response('{"credits":2}', { status: 200 });
  const client = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', { fetch });
  const rejected = await client.createOrder({ links: [{ page_target: 'https://x.fr/', anchor_type: 'exact' }], ...COMMIT });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 422);

  const noFallback = new NinjalinkingApiClient('https://app.ninjalinking.fr', 'secret', {
    legacyWriteFallback: false,
    fetch: async () => new Response('{"message":"Not Found"}', { status: 404 }),
  });
  const missing = await noFallback.createOrder({ links: [{ page_target: 'https://x.fr/', anchor_type: 'exact' }], ...COMMIT });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 404);
});
