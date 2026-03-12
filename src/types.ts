export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface Order {
  id: string;
  no: string;
  label: string;
  status: 'unpaid' | 'paid' | 'pending' | 'in_control' | 'complete';
  user_id: string;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
  links?: Link[];
  user?: User;
  [key: string]: any;
}

export interface Link {
  id: string;
  order_id: string;
  page_target: string;
  anchor_type: string;
  work_step: 'default' | 'pending' | 'in_progress' | 'link_added';
  niche: string;
  delivery_date: string;
  comment: string | null;
  position: number;
  back_verification: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface User {
  id: string;
  fullname: string;
  email: string;
  credits: number;
  role: string;
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
  [key: string]: any;
}

export interface Credit {
  id: string;
  amount: number;
  credits: number;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  [key: string]: any;
}

export interface CreateOrderLink {
  page_target: string;
  anchor_type: 'exact' | 'partial' | 'generic';
  niche?: string;
  delivery_date?: string; // format YYYY-MM
  comment?: string;
  qty?: number;
}

export interface CreateOrderParams {
  label?: string;
  links: CreateOrderLink[];
}

export interface CreateDelegationParams {
  details: string;
  site: string[];
  qty: number;
  budget?: number;
  payment_mode: 'onetime' | 'monthly';
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  [key: string]: any;
}
