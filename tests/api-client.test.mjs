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
