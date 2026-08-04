import type {
  ApiResult,
  CommitParams,
  CreateDelegationParams,
  CreateOrderLink,
  CreateOrderParams,
  HttpMethod,
} from './types.js';

type Fetch = typeof globalThis.fetch;

export interface ClientOptions {
  fetch?: Fetch;
  timeoutMs?: number;
  allowCustomHost?: boolean;
  legacyReadFallback?: boolean;
  legacyWriteFallback?: boolean;
}

const DEFAULT_HOST = 'app.linkontext.com';
// Hôtes officiels acceptés sans NINJALINKING_ALLOW_CUSTOM_HOST.
// app.ninjalinking.fr conservé pour rétrocompat (migration domaine 07/2026,
// l'API y reste servie) — les clients existants ne cassent pas.
const ALLOWED_HOSTS = new Set([DEFAULT_HOST, 'app.ninjalinking.fr']);
const RETRYABLE = new Set([429, 502, 503, 504]);
// Miroir de config('tools.orders.due_date_min_days') côté serveur. Utilisé
// uniquement pour les warnings du preview émulé (fallback legacy) — la
// validation métier (J+3, gate clé API, horizon 12 mois) reste serveur.
const DUE_DATE_MIN_DAYS = 3;
const LEGACY_PREVIEW_TTL_MS = 10 * 60_000;

export class NinjalinkingApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: Fetch;
  private readonly timeoutMs: number;
  private readonly legacyReadFallback: boolean;
  private readonly legacyWriteFallback: boolean;

  constructor(baseUrl: string, token: string, options: ClientOptions = {}) {
    this.baseUrl = validateBaseUrl(baseUrl, options.allowCustomHost ?? false);
    if (!token.trim()) throw new Error('NINJALINKING_API_TOKEN is required.');
    this.token = token;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.legacyReadFallback = options.legacyReadFallback ?? true;
    this.legacyWriteFallback = options.legacyWriteFallback ?? true;
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
    if (result.ok || !this.legacyReadFallback || !isV1Missing(result)) return result;
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

  async previewOrder(params: CreateOrderParams): Promise<ApiResult<unknown>> {
    const result = await this.request('/api/integrations/v1/orders/preview', 'POST', params);
    if (result.ok || !this.legacyWriteFallback || !isV1Missing(result)) return result;
    // Le serveur legacy n'a pas d'endpoint preview : émulation locale du
    // contrat v1 (impact crédits + warnings deadline). Le confirmation_token
    // est purement décoratif ici — le create fallback ne le vérifie pas, la
    // validation métier reste appliquée par le serveur au POST /api/orders.
    const credits = await this.request<unknown>('/api/payments/credits');
    if (!credits.ok) return credits;
    const creditsAvailable = Number(asRecord(credits.data).credits ?? 0);
    const creditsNeeded = params.links.reduce((sum, link) => sum + (link.qty ?? 1), 0);
    const warnings = dueDateWarnings(params.links);
    return legacyData({
      credits_needed: creditsNeeded,
      credits_available: creditsAvailable,
      payment_required: creditsAvailable < creditsNeeded,
      ...(warnings.length ? { due_date_warnings: warnings } : {}),
      confirmation_token: randomToken(),
      expires_at: new Date(Date.now() + LEGACY_PREVIEW_TTL_MS).toISOString(),
    });
  }

  async createOrder(params: CommitParams<CreateOrderParams>): Promise<ApiResult<unknown>> {
    const result = await this.request('/api/integrations/v1/orders', 'POST', params);
    if (result.ok || !this.legacyWriteFallback || !isV1Missing(result)) return result;
    // Legacy : pas de flow preview/commit ni d'idempotence serveur (le POST
    // n'est jamais rejoué automatiquement, attempts=1).
    const { confirmation_token: _token, idempotency_key: _key, ...payload } = params;
    const legacy = await this.request<unknown>('/api/orders', 'POST', payload);
    if (!legacy.ok) return legacy;
    const body = asRecord(legacy.data);
    const message = typeof body.message === 'string' ? body.message : '';
    return legacyData({
      message,
      order: sanitizeOrder(body.order),
      credits_remaining: Number(body.credit_left ?? 0),
      // Le legacy ne renvoie pas payment_required sur la branche API : déduit
      // du message contrôleur ("Finalisez le paiement" = crédits insuffisants).
      payment_required: message.includes('Finalisez'),
    }, legacy.status);
  }

  async previewPayment(orderId: string): Promise<ApiResult<unknown>> {
    const result = await this.request(`/api/integrations/v1/orders/${orderId}/payment/preview`, 'POST', {});
    if (result.ok || !this.legacyWriteFallback || !isV1Missing(result)) return result;
    const [order, credits] = await Promise.all([
      this.request<unknown>(`/api/orders/${orderId}`),
      this.request<unknown>('/api/payments/credits'),
    ]);
    if (!order.ok) return order;
    if (!credits.ok) return credits;
    const links = asRecord(asRecord(order.data).order).links;
    return legacyData({
      order_id: orderId,
      credits_needed: Array.isArray(links) ? links.length : 0,
      credits_available: Number(asRecord(credits.data).credits ?? 0),
      confirmation_token: randomToken(),
      expires_at: new Date(Date.now() + LEGACY_PREVIEW_TTL_MS).toISOString(),
    });
  }

  async payOrder(orderId: string, confirmationToken: string, idempotencyKey: string): Promise<ApiResult<unknown>> {
    const result = await this.request(`/api/integrations/v1/orders/${orderId}/payment`, 'POST', {
      confirmation_token: confirmationToken,
      idempotency_key: idempotencyKey,
    });
    if (result.ok || !this.legacyWriteFallback || !isV1Missing(result)) return result;
    const legacy = await this.request<unknown>(`/api/orders/${orderId}/pay`, 'POST', {});
    if (!legacy.ok) return legacy;
    const body = asRecord(legacy.data);
    return legacyData({
      message: typeof body.message === 'string' ? body.message : '',
      order: sanitizeOrder(body.order),
    }, legacy.status);
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
  const url = new URL(value || 'https://app.linkontext.com');
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !local) throw new Error('The API URL must use HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('The API URL must not contain credentials, query, or fragment.');
  if (!allowCustomHost && !local && !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('Custom API hosts require NINJALINKING_ALLOW_CUSTOM_HOST=true.');
  }
  return url.toString().replace(/\/$/, '');
}

// Route v1 absente (pré-rollout API integrations) : 403/404, 405 (le
// catch-all SPA de prod n'accepte que GET, un POST sur route inexistante
// renvoie 405), ou catch-all qui renvoie du HTML en 200 (invalid_json).
function isV1Missing(result: ApiResult<unknown>): boolean {
  return !result.ok && (result.status === 403 || result.status === 404 || result.status === 405 || result.code === 'invalid_json');
}

// Enveloppe une réponse fallback au format v1 ({data: {...}}), marquée
// legacy_fallback pour que l'agent appelant sache qu'il n'y a ni idempotence
// ni vérification serveur du confirmation_token sur ce chemin.
function legacyData(payload: Record<string, unknown>, status = 200): ApiResult<unknown> {
  return { ok: true, status, data: { data: { ...payload, legacy_fallback: true } } };
}

// 64 hex chars — même gabarit que le confirmation_token v1 (Str::random(64)).
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Miroir de IntegrationController::dueDateWarnings (deadline <= J+min+2).
function dueDateWarnings(links: CreateOrderLink[]): string[] {
  const tight = new Date();
  tight.setHours(0, 0, 0, 0);
  tight.setDate(tight.getDate() + DUE_DATE_MIN_DAYS + 2);
  const warnings: string[] = [];
  links.forEach((link, index) => {
    if (!link.due_date) return;
    const dueDate = new Date(`${link.due_date}T00:00:00`);
    if (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() <= tight.getTime()) {
      warnings.push(`Lien ${index + 1} : deadline serrée (${link.due_date}), aucune marge en cas d'imprévu prestataire.`);
    }
  });
  return warnings;
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
  return pick(link, ['id', 'page_target', 'anchor_type', 'work_step', 'delivery_date', 'due_date', 'comment', 'position', 'backlink_url']);
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
