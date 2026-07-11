import { z } from 'zod';

const httpUrl = z.string().max(2048).url().refine(value => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Only http:// and https:// URLs are allowed.');

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a real month in YYYY-MM format.');

export const emptyInput = z.object({});
export const pageSize = z.number().int().min(1).max(100).default(25);
export const orderStatus = z.enum(['unpaid', 'paid', 'pending', 'in_control', 'complete']);

export const orderPayload = z.object({
  label: z.string().max(255).optional(),
  customer_email: z.string().email().max(255).optional(),
  links: z.array(z.object({
    page_target: httpUrl,
    anchor_type: z.string().trim().min(1).max(255),
    delivery_date: yearMonth.optional(),
    comment: z.string().max(255).optional(),
    qty: z.number().int().min(1).max(55).default(1),
  })).min(1).max(55).refine(
    links => links.reduce((sum, link) => sum + link.qty, 0) <= 55,
    'The total quantity cannot exceed 55.'
  ),
});

export const delegationPayload = z.object({
  details: z.string().trim().min(10).max(5000),
  site: z.array(httpUrl).min(1).max(50),
  qty: z.number().int().min(4).max(199),
  budget: z.number().min(0).optional(),
  payment_mode: z.enum(['onetime', 'monthly']),
});

export const commitFields = {
  confirmation_token: z.string().length(64),
  idempotency_key: z.string().min(8).max(100),
};

export const toolOutput = z.object({
  ok: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    status: z.number(),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.any().optional(),
  }).optional(),
});
