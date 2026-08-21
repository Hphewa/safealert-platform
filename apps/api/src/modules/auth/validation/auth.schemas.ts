import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120),
  email: z.string().trim().email('Email must be valid.').transform((email) => email.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

export const loginSchema = z.object({
  email: z.string().trim().email('Email must be valid.').transform((email) => email.toLowerCase()),
  password: z.string().min(1, 'Password is required.')
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token is required.')
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token is required.')
});
