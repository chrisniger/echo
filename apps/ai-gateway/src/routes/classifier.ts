import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { config } from '../config.js';

const classifyRequestSchema = z.object({
  system: z.string().min(1).max(4000),
  user: z.string().min(1).max(8000),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(32).max(2000).optional(),
  model: z.string().optional(),
});

const classifyResponseSchema = z.object({
  isQuestion: z.boolean(),
  confidence: z.number().min(0).max(1),
  category: z.string().min(1).max(60),
  sessionMode: z.string().min(1).max(60).optional(),
  topic: z.string().max(200).optional(),
  reasoning: z.string().max(500).optional(),
});

const VALID_CATEGORIES = new Set([
  'Behavioral', 'Technical', 'Coding', 'System Design', 'SQL', 'Architecture',
  'DevOps', 'Cloud', 'Security', 'Networking', 'Database', 'Project Management',
  'Leadership', 'Communication', 'Meeting Action', 'Meeting Discussion',
  'Meeting Summary Request', 'Decision Request', 'Brainstorming', 'Presentation',
  'General Discussion', 'Follow-up', 'Clarification', 'Greeting', 'Small Talk', 'Unknown',
]);

const VALID_MODES = new Set([
  'Interview', 'Technical Interview', 'Behavioral Interview', 'Coding Assessment',
  'System Design Interview', 'Meeting', 'Presentation', 'Training', 'Sales Call',
  'Support Call', 'Consultation', 'Brainstorming', 'Code Review', 'Architecture Review', 'Unknown',
]);

export function createClassifierRouter(): Router {
  const router = Router();

  router.post('/classify/question', async (req, res) => {
    const parsed = classifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.errors });
      return;
    }

    // Provider fallback chain — prefer Groq (fast + free), then OpenAI, then DeepSeek.
    const candidates: Array<{
      name: string;
      baseUrl: string;
      apiKey: string;
      model: string;
    }> = [];

    if (config.groq.apiKey) {
      candidates.push({
        name: 'groq',
        baseUrl: config.groq.baseUrl,
        apiKey: config.groq.apiKey,
        model: parsed.data.model || 'llama-3.1-8b-instant',
      });
    }
    if (config.openai.apiKey) {
      candidates.push({
        name: 'openai',
        baseUrl: config.openai.baseUrl,
        apiKey: config.openai.apiKey,
        model: parsed.data.model || 'gpt-4o-mini',
      });
    }
    if (config.deepseek.apiKey) {
      candidates.push({
        name: 'deepseek',
        baseUrl: config.deepseek.baseUrl,
        apiKey: config.deepseek.apiKey,
        model: 'deepseek-chat',
      });
    }

    if (candidates.length === 0) {
      res.status(503).json({
        error: 'No AI provider configured for question classifier. Set GROQ_API_KEY or OPENAI_API_KEY in ai-gateway/.env.',
      });
      return;
    }

    const start = Date.now();
    let lastError: string | null = null;

    for (const cand of candidates) {
      try {
        const client = new OpenAI({ apiKey: cand.apiKey, baseURL: cand.baseUrl });

        // Force JSON output where supported (OpenAI + Groq both support
        // response_format: { type: 'json_object' }).
        const response = await client.chat.completions.create({
          model: cand.model,
          messages: [
            { role: 'system', content: parsed.data.system },
            { role: 'user', content: parsed.data.user },
          ],
          temperature: parsed.data.temperature ?? 0,
          max_tokens: parsed.data.maxTokens ?? 220,
          response_format: { type: 'json_object' as const },
        });

        const text = response.choices?.[0]?.message?.content ?? '';
        const json = tryParseJson(text);
        if (!json) {
          lastError = `${cand.name} returned non-JSON: ${text.slice(0, 200)}`;
          continue;
        }

        const validated = classifyResponseSchema.safeParse(json);
        if (!validated.success) {
          lastError = `${cand.name} returned invalid JSON: ${validated.error.message}`;
          continue;
        }

        const category = VALID_CATEGORIES.has(validated.data.category)
          ? validated.data.category
          : 'Unknown';
        const sessionMode = validated.data.sessionMode && VALID_MODES.has(validated.data.sessionMode)
          ? validated.data.sessionMode
          : 'Unknown';

        res.json({
          isQuestion: validated.data.isQuestion,
          confidence: validated.data.confidence,
          category,
          sessionMode,
          topic: validated.data.topic,
          reasoning: validated.data.reasoning,
          provider: cand.name,
          model: cand.model,
          processingTimeMs: Date.now() - start,
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[Classifier] ${cand.name} failed: ${lastError}`);
        continue;
      }
    }

    console.error(`[Classifier] All providers failed. Last error: ${lastError}`);
    res.status(502).json({
      error: lastError || 'All classifier providers failed',
    });
  });

  return router;
}

function tryParseJson(text: string): unknown | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Some models return JSON embedded in prose; try to extract the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}
