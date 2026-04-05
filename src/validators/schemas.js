import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────
export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['admin', 'analyst', 'viewer']),
});

// ── User management ───────────────────────────────────────────
export const createUserSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8).max(72),
  full_name: z.string().min(1).max(255),
  role:      z.enum(['admin', 'analyst', 'viewer']),
  status:    z.enum(['active', 'inactive']).default('active'),
});

export const updateUserSchema = z
  .object({
    full_name: z.string().min(1).max(255).optional(),
    status:    z.enum(['active', 'inactive']).optional(),
    password:  z.string().min(8).max(72).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

// ── Financial records ─────────────────────────────────────────
export const createRecordSchema = z.object({
  title:       z.string().min(1).max(255),
  record_type: z.enum(['revenue', 'expense', 'asset', 'liability', 'equity']),
  amount:      z.number().positive(),
  currency:    z.string().length(3).default('USD'),
  description: z.string().max(2000).optional(),
  recorded_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateRecordSchema = z
  .object({
    title:          z.string().min(1).max(255).optional(),
    record_type:    z.enum(['revenue', 'expense', 'asset', 'liability', 'equity']).optional(),
    amount:         z.number().positive().optional(),
    currency:       z.string().length(3).optional(),
    description:    z.string().max(2000).optional(),
    recorded_at:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    client_version: z.number().int().positive(),
  })
  .refine(
    (d) => Object.keys(d).filter((k) => k !== 'client_version').length > 0,
    { message: 'At least one field to update is required (besides client_version)' }
  );

// ── Polling query params ──────────────────────────────────────
export const pollQuerySchema = z.object({
  since:     z.string().datetime().optional(),
  page:      z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
