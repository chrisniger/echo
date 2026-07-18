import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';

const embeddingRequestSchema = z.object({
  text: z.string(),
  model: z.string().optional().default('text-embedding-3-small'),
});

export function createEmbeddingRouter(): Router {
  const router = Router();

  router.post('/embeddings', async (req, res) => {
    try {
      const parsed = embeddingRequestSchema.parse(req.body);
      
      // Generate embeddings using OpenAI or fallback to local model
      const embedding = await generateEmbedding(parsed.text, parsed.model);
      
      res.json({ embedding, model: parsed.model });
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

async function generateEmbedding(text: string, model: string): Promise<number[]> {
  // Try to use OpenAI embeddings API if configured
  const openaiKey = config.openai.apiKey;
  
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: model,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
        return data.data?.[0]?.embedding || generateLocalEmbedding(text);
      }
    } catch (error) {
      console.error('[Embeddings] OpenAI API failed, using fallback:', error);
    }
  }

  // Fallback to local hash-based embedding
  return generateLocalEmbedding(text);
}

function generateLocalEmbedding(text: string): number[] {
  // Simple hash-based embedding for local development
  const embedding = new Array(1536).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash;
    }
    const index = Math.abs(hash) % 1536;
    embedding[index] += 1;
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}
