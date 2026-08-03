export type HttpMethod = 'GET' | 'POST';

export interface ApiError {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
}

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
  replayed?: boolean;
}

export type ApiResult<T = unknown> = ApiSuccess<T> | ApiError;

export interface CreateOrderLink {
  page_target: string;
  anchor_type: string;
  delivery_date?: string;
  due_date?: string;
  comment?: string;
  qty?: number;
}

export interface CreateOrderParams {
  label?: string;
  customer_email?: string;
  links: CreateOrderLink[];
}

export interface CreateDelegationParams {
  details: string;
  site: string[];
  qty: number;
  budget?: number;
  payment_mode: 'onetime' | 'monthly';
}

export type CommitParams<T> = T & {
  confirmation_token: string;
  idempotency_key: string;
};
