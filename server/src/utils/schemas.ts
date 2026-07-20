import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createUrlSchema = z.object({
  originalUrl: z.string().url('Must be a valid URL'),
  customAlias: z
    .string()
    .min(3)
    .max(30)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Alias can only contain letters, numbers, hyphens and underscores'
    )
    .optional(),
  title: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  expirationDate: z.string().datetime().optional(),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export const updateUrlSchema = z.object({
  title: z.string().max(200).optional(),
  customAlias: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .nullable(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  expirationDate: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});
