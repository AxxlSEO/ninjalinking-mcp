import type {
  ApiResult,
  CommitParams,
  CreateDelegationParams,
  CreateOrderParams,
  HttpMethod,
} from './types.js';

type Fetch = typeof globalThis.fetch;

export interface ClientOptions {
  fetch?: Fetch;
  timeoutMs?: number;
  allowCustomHost?: boolean;
  legacyReadFallback?: boolean;
}

const DEFAULT_HOST = 'app.ninjalinking.fr';
const RETRYABLE = new Set([429, 502, 503, 504]);

export class NinjalinkingApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: Fetch;
  private readonly timeoutMs: number;
  private readonly legacyReadFallback: boolean;

  constructor(baseUrl: string, token: string, options: ClientOptions = {}) {
    this.baseUrl = validateBaseUrl(baseUrl, options.allowCustomHost ?? false);
    if (!token.trim()) throw new Error('NINJALINKING_API_TOKEN is required.');
    this.token = token;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.legacyReadFallback = options.legacyReadFallback ?? true;
  }

  async request<T>(endpoint: string, method: HttpMethod = 'GET', body?: unknown): Promise<ApiResult<T>> {
    const attempts = method === 'GET' ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await this.fetchFn(`${this.baseUrl}${endpoint}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const text = await response.text();
        const parsed = parseJson(text);

        if (!response.ok) {
          const error = toApiError(response.status, parsed, text);
          if (method === 'GET' && RETRYABLE.has(response.status) && attempt < attempts - 1) {
            await delay(retryDelay(response.headers.get('retry-after'), attempt));
            continue;
          }
          return error;
        }
        if (parsed === undefined) {
          return {
            ok: false,
            status: 502,
            code: 'invalid_json',
            message: 'The NinjaLinking API returned a non-JSON response.',
            retryable: true,
          };
        }
        return {
          ok: true,
          status: response.status,
          data: parsed as T,
          replayed: response.headers.get('idempotent-replay') === 'true',
        };
      } catch (error) {
        const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        if (method === 'GET' && attempt < attempts - 1) {
          await delay(100 * 2 ** attempt);
          continue;
        }
        return {
          ok: false,
          status: 0,
          code: timeout ? 'timeout' : 'network_error',
          message: timeout
            ? `The NinjaLinking API did not respond within ${this.timeoutMs} ms.`
            : 'Unable to reach the NinjaLinking API.',
          retryable: method === 'GET',
        };
      }
    }
    throw new Error('Unreachable request state.');
  }

  private async integrationRead<T>(path: string, legacyPath: string, legacyMap: (value: unknown) => T): Promise<ApiResult<T>> {
    const result = await this.request<T>(`/api/integrations/v1${path}`);
    if (result.ok || result.status !== 403 || !this.legacyReadFallback) return result;
    const legacy = await this.request<unknown>(legacyPath);
    return legacy.ok ? { ...legacy, data: legacyMap(legacy.data) } : legacy;
  }

  getProfile() {
    return this.integrationRead('/profile', '/api/auth/me', value => {
      const user = asRecord(asRecord(value).user);
      return { data: pick(user, ['id', 'fullname', 'role', 'credits']) };
    });
  }

  getCredits() {
    return this.integrationRead('/credits', '/api/payments/credits', value => ({
      data: { credits: Number(asRecord(value).credits ?? 0) },
    }));
  }

  listOrders(filters: { status?: string; search?: string; pageSize?: number } = {}) {
    const params = query({ status: filters.status, search: filters.search, page_size: filters.pageSize });
    const legacyParams = query({
      'filters[status]': filters.status,
      'filters[search]': filters.search,
      pageSize: filters.pageSize,
    });
    return this.integrationRead(`/orders${params}`, `/api/orders${legacyParams}`, sanitizeLegacyPage(sanitizeOrder));
  }

  getOrder(id: string) {
    return this.integrationRead(`/orders/${id}`, `/api/orders/${id}`, value => ({
      data: sanitizeOrder(asRecord(value).order),
    }));
  }

  getLink(id: string) {
    return this.integrationRead(`/links/${id}`, `/api/links/${id}`, value => ({
      data: sanitizeLink(asRecord(value).link),
    }));
  }

  previewOrder(params: CreateOrderParams) {
    return this.request('/api/integrations/v1/orders/preview', 'POST', params);
  }

  createOrder(params: CommitParams<CreateOrderParams>) {
    return this.request('/api/integrations/v1/orders', 'POST', params);
  }

  previewPayment(orderId: string) {
    return this.request(`/api/integrations/v1/orders/${orderId}/payment/preview`, 'POST', {});
  }

  payOrder(orderId: string, confirmationToken: string, idempotencyKey: string) {
    return this.request(`/api/integrations/v1/orders/${orderId}/payment`, 'POST', {
      confirmation_token: confirmationToken,
      idempotency_key: idempotencyKey,
    });
  }

  getCreditHistory(pageSize = 25) {
    const params = query({ page_size: pageSize });
    return this.integrationRead(`/credits/history${params}`, '/api/payments/history', sanitizeLegacyPage(sanitizeCredit));
  }

  getAvailablePacks() {
    return this.integrationRead('/credits/packs', '/api/payments/packs', value => ({
      data: { packs: Array.isArray(asRecord(value).packs) ? asRecord(value).packs : [] },
    }));
  }

  listDelegations(filters: { paymentMode?: string; pageSize?: number } = {}) {
    const params = query({ payment_mode: filters.paymentMode, page_size: filters.pageSize });
    const legacy = query({ 'filters[payment_mode]': filters.paymentMode, pageSize: filters.pageSize });
    return this.integrationRead(`/delegations${params}`, `/api/orders/delegation${legacy}`, sanitizeLegacyPage(sanitizeDelegation));
  }

  getDelegation(id: string) {
    return this.integrationRead(`/delegations/${id}`, `/api/orders/delegation/${id}`, value => ({
      data: sanitizeDelegation(asRecord(value).order),
    }));
  }

  previewDelegation(params: CreateDelegationParams) {
    return this.request('/api/integrations/v1/delegations/preview', 'POST', params);
  }

  createDelegation(params: CommitParams<CreateDelegationParams>) {
    return this.request('/api/integrations/v1/delegations', 'POST', params);
  }
}

export function validateBaseUrl(value: string, allowCustomHost: boolean): string {
  const url = new URL(value || 'https://app.ninjalinking.fr');
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !local) throw new Error('The API URL must use HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('The API URL must not contain credentials, query, or fragment.');
  if (!allowCustomHost && !local && url.hostname !== DEFAULT_HOST) {
    throw new Error('Custom API hosts require NINJALINKING_ALLOW_CUSTOM_HOST=true.');
  }
  return url.toString().replace(/\/$/, '');
}

function parseJson(text: string): unknown | undefined {
  if (!text.trim()) return {};
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
}

function toApiError(status: number, parsed: unknown, raw: string): ApiResult<never> {
  const body = asRecord(parsed);
  const nested = asRecord(body.error);
  const code = String(nested.code ?? body.code ?? `http_${status}`);
  const message = String(nested.message ?? (typeof body.error === 'string' ? body.error : body.message) ?? (raw.startsWith('<') ? 'Upstream returned HTML.' : `HTTP ${status}`));
  return {
    ok: false,
    status,
    code,
    message,
    details: nested.details ?? body.validation ?? body.details,
    retryable: Boolean(nested.retryable) || RETRYABLE.has(status),
  };
}

function retryDelay(value: string | null, attempt: number): number {
  if (value && /^\d+$/.test(value)) return Math.min(Number(value) * 1000, 2_000);
  return 100 * 2 ** attempt;
}

function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, String(value));
  const result = params.toString();
  return result ? `?${result}` : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pick(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter(key => key in value).map(key => [key, value[key]]));
}

function sanitizeLink(value: unknown) {
  const link = asRecord(value);
  return pick(link, ['id', 'page_target', 'anchor_type', 'work_step', 'delivery_date', 'comment', 'position', 'backlink_url']);
}

function sanitizeOrder(value: unknown) {
  const order = asRecord(value);
  return {
    ...pick(order, ['id', 'no', 'label', 'status', 'shipped_at', 'created_at']),
    links: Array.isArray(order.links) ? order.links.map(sanitizeLink) : [],
  };
}

function sanitizeCredit(value: unknown) {
  return pick(asRecord(value), ['id', 'amount', 'credits', 'status', 'created_at']);
}

function sanitizeDelegation(value: unknown) {
  return pick(asRecord(value), ['id', 'ref', 'details', 'site', 'qty', 'budget', 'payment_mode', 'total_price', 'payment_status', 'subscription_status', 'order_status', 'created_at']);
}

function sanitizeLegacyPage(mapper: (value: unknown) => unknown) {
  return (value: unknown) => {
    const page = asRecord(value);
    const source = Array.isArray(value) ? value : Array.isArray(page.data) ? page.data : [];
    return { data: {
      items: source.map(mapper),
      page: Number(page.current_page ?? 1),
      page_size: Number(page.per_page ?? source.length),
      total: Number(page.total ?? source.length),
      last_page: Number(page.last_page ?? 1),
    } };
  };
}
