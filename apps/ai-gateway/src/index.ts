import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { AiRouter } from './services/router.js';
import { PromptCache } from './services/cache.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { OllamaProvider } from './providers/ollama.js';
import { createHealthRouter } from './routes/health.js';
import { createChatRouter } from './routes/chat.js';
import { createAdminRouter } from './routes/admin.js';
import { createTranscriptionRouter } from './routes/transcription.js';
import { createImageAnalysisRouter } from './routes/image-analysis.js';
import { createEmbeddingRouter } from './routes/embeddings.js';
import { createCvParserRouter } from './routes/cv-parser.js';
import { createClassifierRouter } from './routes/classifier.js';

const app = express();
const router = new AiRouter();
const cache = new PromptCache();

app.use(helmet() as any);
app.use(cors({ origin: config.corsOrigin }) as any);
app.use(express.json({ limit: '10mb' }));

const providers = [
  { name: 'OpenAI', ctor: OpenAIProvider, key: config.openai.apiKey },
  { name: 'Anthropic', ctor: AnthropicProvider, key: config.anthropic.apiKey },
  { name: 'Gemini', ctor: GeminiProvider, key: config.gemini.apiKey },
  { name: 'DeepSeek', ctor: DeepSeekProvider, key: config.deepseek.apiKey },
  { name: 'OpenRouter', ctor: OpenRouterProvider, key: config.openrouter.apiKey },
  { name: 'Ollama', ctor: OllamaProvider, key: null },
];

let registeredCount = 0;
for (const p of providers) {
  if (p.key || p.name === 'Ollama') {
    try {
      router.register(new p.ctor());
      registeredCount++;
      console.log(`  ✓ ${p.name} provider registered`);
    } catch (err) {
      console.log(`  ✗ ${p.name} provider failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

const healthRouter = createHealthRouter(router);
const chatRouter = createChatRouter(router, cache);
const adminRouter = createAdminRouter(router, cache);
const transcriptionRouter = createTranscriptionRouter();
const imageAnalysisRouter = createImageAnalysisRouter();
const embeddingRouter = createEmbeddingRouter();
const cvParserRouter = createCvParserRouter();
const classifierRouter = createClassifierRouter();

app.use('/api', healthRouter);
app.use('/api', chatRouter);
app.use('/api', adminRouter);
app.use('/api', transcriptionRouter);
app.use('/api', imageAnalysisRouter);
app.use('/api', embeddingRouter);
app.use('/api', cvParserRouter);
app.use('/api', classifierRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`\n  Echo AI Gateway running on http://localhost:${config.port}`);
  console.log(`  Registered ${registeredCount}/${providers.length} providers\n`);
});
