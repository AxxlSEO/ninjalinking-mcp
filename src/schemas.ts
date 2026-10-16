import { z } from 'zod';

const httpUrl = z.string().max(2048).url().refine(value => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Only http:// and https:// URLs are allowed.');

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a real month in YYYY-MM format.');

const isoDate = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Use a real date in YYYY-MM-DD format.')
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a real calendar date in YYYY-MM-DD format.');

export const emptyInput = z.object({});
export const pageSize = z.number().int().min(1).max(100).default(25);
export const orderStatus = z.enum(['unpaid', 'paid', 'pending', 'in_control', 'complete']);

export const orderPayload = z.object({
  // Obligatoire dans le formulaire de l'interface : on aligne, sinon la vue
  // admin se remplit de commandes sans nom.
  label: z.string().trim().min(1).max(255).describe('Order name shown to the client and the admins, e.g. "Acme — November 2026". Required, like in the web form.'),
  customer_email: z.string().email().max(255).optional(),
  links: z.array(z.object({
    page_target: httpUrl,
    // Nom historique trompeur : ce champ porte le TEXTE de l'ancre (ou une consigne
    // d'optimisation), pas une catégorie exact/partial/generic.
    anchor_type: z.string().trim().min(1).max(255).describe(
      'Free text, NOT a category. Put here the anchor wording the link builder must use: either the exact anchor text to copy-paste verbatim (e.g. "snow socks from Musher", or a bare URL for a naked-URL anchor), or an optimisation instruction in plain words (e.g. "partial anchor around winter tyres"). Do not reduce it to "exact", "partial" or "generic" and do not move the anchor text into comment.'
    ),
    delivery_date: yearMonth.optional(),
    // Deadline "livré au plus tard le" (J+3 minimum) — la validation métier
    // (délai, horizon, cohérence avec delivery_date) reste côté serveur.
    due_date: isoDate.optional(),
    comment: z.string().max(5000).optional().describe('Optional placement instructions for the link builder (topic, forum context, what the author should say). The anchor itself belongs in anchor_type.'),
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
