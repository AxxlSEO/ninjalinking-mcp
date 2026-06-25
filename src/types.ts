// ── Generic API wrapper ───────────────────────────────────────────
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/**
 * Laravel LengthAwarePaginator JSON shape, as returned verbatim when a
 * controller does `response()->json($paginator)` (e.g. credit history,
 * delegations list, and orders list when pageSize !== -1).
 */
export interface PaginatedResponse<T> {
  current_page: number;
  data: T[];
  first_page_url: string | null;
  from: number | null;
  last_page: number;
  last_page_url: string | null;
  links: Array<{ url: string | null; label: string; active: boolean }>;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
  [key: string]: any;
}

// ── Domain models ─────────────────────────────────────────────────
export interface Order {
  id: string;
  no: string;
  label: string;
  status: 'unpaid' | 'paid' | 'pending' | 'in_control' | 'complete';
  user_id: string;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations — present depending on the endpoint (eager-loaded server-side)
  links?: Link[];
  user?: User;
  invoice?: Record<string, any> | null;
  providers?: User[];
  controllers?: User[];
  comments?: Record<string, any>[];
  providers_ratings?: Record<string, any>[];
  [key: string]: any;
}

export interface Link {
  id: string;
  order_id: string;
  page_target: string;
  anchor_type: string;
  work_step: 'default' | 'pending' | 'in_progress' | 'link_added' | null;
  niche: string | null;
  delivery_date: string | null;
  comment: string | null;
  position: number;
  back_verification: Record<string, any> | null;
  needs_redo?: boolean;
  redo_detected_at?: string | null;
  bonus_by?: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  order?: Order;
  comments?: Record<string, any>[];
  [key: string]: any;
}

export interface User {
  id: string;
  fullname: string;
  email: string;
  role: string;
  status?: string;
  credits: number;
  twitter_id?: string;
  email_verified_at?: string | null;
  stripe_customer_id?: string | null;
  image?: Record<string, any> | null;
  has_ordered?: boolean;
  link_contributions_count?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface DelegatedOrder {
  id: string;
  ref: string;
  details: string;
  site: string[];
  qty: number;
  budget: number | null;
  payment_mode: 'onetime' | 'monthly';
  total_price: number;
  payment_status: 'pending' | 'paid';
  subscription_status: string | null;
  order_status: 'pending' | 'completed';
  orders: string[];
  created_at: string;
  updated_at?: string;
  // Relations
  user?: User;
  payments?: Record<string, any>[];
  [key: string]: any;
}

export interface Credit {
  id: string;
  user_id: string;
  amount: number;
  credits: number;
  status: string;
  stripe_payment_intent_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  price_ht: number;
  featured: boolean;
  features: string[];
}

// ── Request params ────────────────────────────────────────────────
export interface CreateOrderLink {
  page_target: string;
  anchor_type: string;
  delivery_date?: string; // format YYYY-MM
  comment?: string;
  qty?: number;
}

export interface CreateOrderParams {
  label?: string;
  /** Admin only: place the order on behalf of the customer with this email. */
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

// ── Response envelopes ─────────────────────────────────────────────
// These mirror exactly what the Laravel controllers return, so the typed
// `ApiResponse<T>.data` matches the JSON the MCP forwards to the assistant.

/** GET /api/auth/me */
export interface ProfileResponse {
  user: User;
}

/** GET /api/payments/credits */
export interface CreditsResponse {
  credits: number;
  user: Pick<User, 'id' | 'fullname' | 'email'>;
}

/** GET /api/payments/packs */
export interface PacksResponse {
  packs: CreditPack[];
}

/**
 * GET /api/orders
 * Returns a bare array when pageSize === -1, otherwise a paginator.
 */
export type OrdersListResponse = PaginatedResponse<Order> | Order[];

/** GET /api/orders/{id} — backlinks_summary is `[]` for plain customers. */
export interface OrderDetailsResponse {
  order: Order;
  backlinks_summary: Record<string, any> | never[];
}

/**
 * Lightweight order shape returned by POST /api/orders when the request is
 * authenticated with an API token (the MCP case). Note: no status/user_id and
 * only a subset of link fields — distinct from the full web (cookie) response.
 */
export interface ApiTokenOrder {
  id: string;
  label: string;
  links: Array<
    Pick<Link, 'id' | 'page_target' | 'anchor_type' | 'delivery_date' | 'comment'>
  >;
}

/** POST /api/orders (API-token response) */
export interface CreateOrderResponse {
  message: string;
  order: ApiTokenOrder;
  credit_left: number;
}

/** POST /api/orders/{id}/pay */
export interface PayOrderResponse {
  message: string;
  order: Order;
}

/** GET /api/orders/delegation/{id} */
export interface DelegationDetailsResponse {
  order: DelegatedOrder;
}

/** POST /api/orders/delegation/create */
export interface CreateDelegationResponse {
  success: boolean;
  order_id: string;
  checkout_url: string;
  payment_type: 'oneshot' | 'subscription';
}

/** GET /api/links/{id} */
export interface LinkResponse {
  link: Link;
}
