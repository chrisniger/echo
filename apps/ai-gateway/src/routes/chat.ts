import { Router } from 'express';
import { z } from 'zod';
import type { AiRouter } from '../services/router.js';
import { ContextAssembler, SYSTEM_PROMPT_BASE } from '../services/context-assembler.js';
import { TokenCounter } from '../services/token-counter.js';
import type { PromptCache } from '../services/cache.js';
import type { AiModel, ChatMessage } from '@echo-gpt/shared-types';

const chatRequestSchema = z.object({
  model: z.enum([
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'gemini-2.0-flash',
    'gemini-2.0-pro',
    'deepseek-chat',
    'deepseek-coder',
    'openrouter/auto',
    'ollama/llama3',
    'ollama/mixtral',
  ]),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    }),
  ),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(128000).optional(),
  sessionId: z.string().optional(),
});

const contextSchema = z.object({
  cv: z.string().optional(),
  jobDescription: z.string().optional(),
  documents: z.array(z.object({ name: z.string(), content: z.string() })).optional(),
  transcript: z
    .array(
      z.object({
        speaker: z.string(),
        text: z.string(),
        timestamp: z.number(),
      }),
    )
    .optional(),
  screenshots: z.array(z.object({ url: z.string(), ocrText: z.string().optional() })).optional(),
  images: z.array(z.object({ url: z.string(), description: z.string().optional() })).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional(),
  customContext: z.string().optional(),
  language: z.string().optional(),
});

export function createChatRouter(routerInstance: AiRouter, cache?: PromptCache): Router {
  const router = Router();
  const contextAssembler = new ContextAssembler();
  const tokenCounter = new TokenCounter();

  router.post('/chat', async (req, res) => {
    try {
      const parsed = chatRequestSchema.parse(req.body);
      const result = await routerInstance.chat(parsed, (req as any).signal);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
      } else {
        const message = err instanceof Error ? err.message : 'Internal server error';
        res.status(500).json({ error: message });
      }
    }
  });

  router.post('/chat/stream', async (req, res) => {
    try {
      const parsed = chatRequestSchema.parse(req.body);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = routerInstance.chatStream(parsed, (req as any).signal);

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
      } else if (!res.headersSent) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        res.status(500).json({ error: message });
      } else {
        res.write(
          `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream error' })}\n\n`,
        );
        res.end();
      }
    }
  });

  router.post('/chat/context', (req, res) => {
    try {
      const parsed = contextSchema.parse(req.body);

      if (cache) {
        const cached = cache.get(SYSTEM_PROMPT_BASE, parsed as Record<string, unknown>);
        if (cached) {
          const tokenCount = tokenCounter.countMessages(cached);
          res.json({ messages: cached, tokenCount, messageCount: cached.length, cached: true });
          return;
        }
      }

      const messages = contextAssembler.assemble(parsed);
      const tokenCount = tokenCounter.countMessages(messages);

      if (cache) {
        cache.set(SYSTEM_PROMPT_BASE, parsed as Record<string, unknown>, messages);
      }

      res.json({
        messages,
        tokenCount,
        messageCount: messages.length,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
      } else {
        const message = err instanceof Error ? err.message : 'Internal server error';
        res.status(500).json({ error: message });
      }
    }
  });

  router.get('/models', (_req, res) => {
    const models = routerInstance.getAvailableModels();
    res.json({ models });
  });

  return router;
}
