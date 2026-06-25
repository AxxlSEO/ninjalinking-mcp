import type {
  ApiResponse,
  Credit,
  DelegatedOrder,
  CreateOrderParams,
  CreateDelegationParams,
  PaginatedResponse,
  ProfileResponse,
  CreditsResponse,
  PacksResponse,
  OrdersListResponse,
  OrderDetailsResponse,
  CreateOrderResponse,
  PayOrderResponse,
  DelegationDetailsResponse,
  CreateDelegationResponse,
  LinkResponse,
} from './types.js';

export class NinjalinkingApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: any
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.error(`[API] ${method} ${url}`);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        console.error(`[API] Error ${response.status}:`, JSON.stringify(data));
        const errorMsg = data.error || data.message || `HTTP ${response.status}`;
        const validation = data.validation || data.details || undefined;
        let enriched = errorMsg;
        if (validation) {
          const details = Object.entries(validation)
            .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
            .join('; ');
          enriched = `${errorMsg} — ${details}`;
        }
        if (response.status === 401) {
          enriched = `Authentication failed: ${errorMsg}. The API token may be invalid or expired. The user should generate a new API key from their NinjaLinking account settings.`;
        }
        if (response.status === 403) {
          enriched = `Permission denied: ${errorMsg}. This action is not allowed for your account role.`;
        }
        return { error: enriched };
      }

      return { data: data as T };
    } catch (error) {
      if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
        return { error: 'Network error: unable to reach the NinjaLinking API. Check your internet connection or try again later.' };
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[API] Failed: ${msg}`);
      return { error: msg };
    }
  }

  // ── Auth / Profile ──────────────────────────────────────────────
  async getProfile(): Promise<ApiResponse<ProfileResponse>> {
    return this.request<ProfileResponse>('/api/auth/me');
  }

  // ── Orders ──────────────────────────────────────────────────────
  async listOrders(filters?: {
    status?: string;
    search?: string;
    pageSize?: number;
  }): Promise<ApiResponse<OrdersListResponse>> {
    const params = new URLSearchParams();
    if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
    if (filters?.status) params.set('filters[status]', filters.status);
    if (filters?.search) params.set('filters[search]', filters.search);
    const qs = params.toString();
    return this.request<OrdersListResponse>(`/api/orders${qs ? '?' + qs : ''}`);
  }

  async getOrder(id: string): Promise<ApiResponse<OrderDetailsResponse>> {
    return this.request<OrderDetailsResponse>(`/api/orders/${id}`);
  }

  async createOrder(params: CreateOrderParams): Promise<ApiResponse<CreateOrderResponse>> {
    return this.request<CreateOrderResponse>('/api/orders', 'POST', params);
  }

  async payOrder(id: string): Promise<ApiResponse<PayOrderResponse>> {
    return this.request<PayOrderResponse>(`/api/orders/${id}/pay`, 'POST');
  }

  // ── Credits / Payments ──────────────────────────────────────────
  async getCredits(): Promise<ApiResponse<CreditsResponse>> {
    return this.request<CreditsResponse>('/api/payments/credits');
  }

  async getCreditHistory(): Promise<ApiResponse<PaginatedResponse<Credit>>> {
    return this.request<PaginatedResponse<Credit>>('/api/payments/history');
  }

  async getAvailablePacks(): Promise<ApiResponse<PacksResponse>> {
    return this.request<PacksResponse>('/api/payments/packs');
  }

  // ── Delegations ─────────────────────────────────────────────────
  async listDelegations(filters?: {
    payment_mode?: string;
    payment_status?: string;
    search?: string;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<DelegatedOrder>>> {
    const params = new URLSearchParams();
    if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
    if (filters?.payment_mode) params.set('filters[payment_mode]', filters.payment_mode);
    if (filters?.payment_status) params.set('filters[payment_status]', filters.payment_status);
    if (filters?.search) params.set('filters[search]', filters.search);
    const qs = params.toString();
    return this.request<PaginatedResponse<DelegatedOrder>>(
      `/api/orders/delegation${qs ? '?' + qs : ''}`
    );
  }

  async getDelegation(id: string): Promise<ApiResponse<DelegationDetailsResponse>> {
    return this.request<DelegationDetailsResponse>(`/api/orders/delegation/${id}`);
  }

  async createDelegation(
    params: CreateDelegationParams
  ): Promise<ApiResponse<CreateDelegationResponse>> {
    return this.request<CreateDelegationResponse>(
      '/api/orders/delegation/create',
      'POST',
      params
    );
  }

  // ── Links ───────────────────────────────────────────────────────
  async getLink(id: string): Promise<ApiResponse<LinkResponse>> {
    return this.request<LinkResponse>(`/api/links/${id}`);
  }
}
