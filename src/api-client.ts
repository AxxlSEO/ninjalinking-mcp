import type { Order, OrderDetails, Link, CompleteLinkRequest, UpdateLinkStepRequest, ApiResponse } from './types.js';

export class NinjalinkingApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    console.error(`[API] ${method} ${url}`);

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
      };

      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json() as any;

      if (!response.ok) {
        console.error(`[API] Error ${response.status}: ${JSON.stringify(data)}`);
        return {
          error: data.message || data.error || `HTTP ${response.status}`,
          data: undefined,
        };
      }

      console.error(`[API] Success: ${JSON.stringify(data).substring(0, 200)}...`);
      return { data: data as T };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[API] Request failed: ${errorMessage}`);
      return {
        error: errorMessage,
        data: undefined,
      };
    }
  }

  async getPendingOrders(): Promise<ApiResponse<Order[]>> {
    return this.makeRequest<Order[]>('/api/mcp/orders?status=paid');
  }

  async getOrderDetails(orderId: number): Promise<ApiResponse<OrderDetails>> {
    return this.makeRequest<OrderDetails>(`/api/mcp/orders/${orderId}`);
  }

  async getPendingLinks(): Promise<ApiResponse<Link[]>> {
    return this.makeRequest<Link[]>('/api/mcp/links/pending');
  }

  async completeLink(params: CompleteLinkRequest): Promise<ApiResponse<Link>> {
    const { link_id, ...body } = params;
    return this.makeRequest<Link>(
      `/api/mcp/links/${link_id}/complete`,
      'POST',
      body
    );
  }

  async updateLinkStep(params: UpdateLinkStepRequest): Promise<ApiResponse<Link>> {
    const { link_id, work_step } = params;
    return this.makeRequest<Link>(
      `/api/mcp/links/${link_id}/work-step`,
      'POST',
      { work_step }
    );
  }
}
