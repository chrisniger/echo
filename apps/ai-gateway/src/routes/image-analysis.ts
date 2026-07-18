import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { config } from '../config.js';

const imageAnalysisRequestSchema = z.object({
  image: z.string(), // base64 encoded image
  analysisType: z.enum(['full', 'objects', 'text', 'description']).optional(),
});

export function createImageAnalysisRouter(): Router {
  const router = Router();

  router.post('/analyze-image', async (req, res) => {
    try {
      const parsed = imageAnalysisRequestSchema.parse(req.body);
      
      const result = await analyzeImage(parsed.image, parsed.analysisType || 'full');
      
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

  return router;
}

async function analyzeImage(
  base64Image: string,
  analysisType: string
): Promise<{
  description: string;
  objects: string[];
  text?: string;
  confidence: number;
}> {
  if (!config.openai.apiKey) {
    throw new Error('Image analysis requires OPENAI_API_KEY');
  }

  const dataUrl = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/png;base64,${base64Image}`;
  const client = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseUrl });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analyze this image for ${analysisType}. Return only valid JSON with this shape: {"description": string, "objects": string[], "text": string, "confidence": number}. Confidence must be between 0 and 1.`,
        },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ],
    }],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  const result = JSON.parse(content) as Partial<{
    description: string;
    objects: string[];
    text: string;
    confidence: number;
  }>;
  return {
    description: result.description || 'No description returned',
    objects: Array.isArray(result.objects) ? result.objects : [],
    text: result.text || '',
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
  };
}
