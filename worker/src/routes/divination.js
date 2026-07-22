/**
 * 卜卦路由（全部需要 authMiddleware）
 *
 * - POST /cast       起卦
 * - POST /interpret  解卦
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { castHexagram, interpretHexagram } from '../services/yiJing.js';

const app = new Hono();

app.use('*', authMiddleware);

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

const castSchema = z.object({
  question: z.string().min(1).max(500),
});

const interpretSchema = z.object({
  hexagram: z
    .object({
      gua: z.string(),
      trigram: z.string().optional(),
      element: z.string().optional(),
      verse: z.string().optional(),
      image: z.string().optional(),
      fortune: z.string().optional(),
      lines: z.array(z.any()).optional(),
      changingLines: z.array(z.number()).optional(),
      question: z.string().optional(),
    })
    .passthrough(),
  question: z.string().min(1).max(500),
  dialogues: z
    .array(
      z.object({
        agentId: z.string(),
        name: z.string().optional(),
        text: z.string(),
      })
    )
    .optional(),
});

/* ------------------------------------------------------------------ *
 * POST /cast
 * ------------------------------------------------------------------ */

app.post('/cast', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = castSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { question } = parsed.data;
  const result = castHexagram(question);
  return c.json(result);
});

/* ------------------------------------------------------------------ *
 * POST /interpret
 * ------------------------------------------------------------------ */

app.post('/interpret', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = interpretSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { hexagram, question, dialogues } = parsed.data;
  const result = interpretHexagram(hexagram, question, dialogues || []);
  return c.json(result);
});

export default app;
