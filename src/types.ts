export interface Order {
  id: number;
  status: string;
  [key: string]: any;
}

export interface OrderDetails extends Order {
  items?: any[];
  links?: Link[];
}

export interface Link {
  id: number;
  order_id: number;
  status: string;
  work_step?: string;
  forum_url?: string;
  anchor_used?: string;
  forum_domain?: string;
  notes?: string;
  [key: string]: any;
}

export interface CompleteLinkRequest {
  link_id: number;
  forum_url: string;
  anchor_used: string;
  forum_domain?: string;
  notes?: string;
}

export interface UpdateLinkStepRequest {
  link_id: number;
  work_step: string;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
}
