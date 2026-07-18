import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { config } from '../config.js';

const transcriptionRequestSchema = z.object({
  audio: z.string(), // base64 encoded audio
  language: z.string().optional(),
  model: z.string().optional(),
  sampleRate: z.number().optional(),
  channels: z.number().optional(),
  encoding: z.string().optional(),
});

export function createTranscriptionRouter(): Router {
  const router = Router();

  router.post('/transcribe', async (req, res) => {
    const parsed = transcriptionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.errors });
      return;
    }

    const { audio, language, model } = parsed.data;
    const audioBuffer = Buffer.from(audio, 'base64');
    console.log(`[Transcription] Received ${audioBuffer.length} bytes of audio`);

    if (isSilentWav(audioBuffer)) {
      res.json({
        text: '',
        language: language || 'en',
        duration: 0,
        segments: [],
        provider: 'silence-filter',
      });
      return;
    }

    try {
      const result = await transcribeAudio(audioBuffer, { language, model });
      console.log(`[Transcription] Success: ${result.segments.length} segments via ${result.provider}`);
      res.json(result);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : '';
      console.error(`[Transcription] FAILED: ${errMsg}`);
      console.error(`[Transcription] Stack: ${errStack}`);
      // Return 200 with structured error so the desktop can show it in the UI
      res.status(200).json({
        text: '',
        language: language || 'en',
        duration: 0,
        segments: [],
        provider: 'error',
        error: errMsg,
      });
    }
  });

  return router;
}

async function transcribeAudio(
  audioBuffer: Buffer,
  options: { language?: string; model?: string },
): Promise<{
  text: string;
  language: string;
  duration: number;
  segments: Array<{ text: string; start: number; end: number; confidence: number }>;
  provider: string;
}> {
  const groqKey = config.groq.apiKey;
  const openaiKey = config.openai.apiKey;

  if (!groqKey && !openaiKey) {
    console.warn('[Transcription] No STT provider configured (GROQ_API_KEY or OPENAI_API_KEY). Returning empty result.');
    return {
      text: '',
      language: options.language || 'en',
      duration: 0,
      segments: [],
      provider: 'none',
    };
  }

  // Prefer Groq (faster, free tier) → fallback OpenAI
  if (groqKey) {
    try {
      return await callWhisperCompatible(
        config.groq.baseUrl,
        groqKey,
        audioBuffer,
        options.model || config.groq.whisperModel,
        options.language,
        'groq',
      );
    } catch (err) {
      console.warn('[Transcription] Groq failed, falling back to OpenAI:', err);
      if (!openaiKey) throw err;
    }
  }

  return await callWhisperCompatible(
    config.openai.baseUrl,
    openaiKey,
    audioBuffer,
    options.model || 'whisper-1',
    options.language,
    'openai',
  );
}

async function callWhisperCompatible(
  baseUrl: string,
  apiKey: string,
  audioBuffer: Buffer,
  model: string,
  language: string | undefined,
  provider: string,
): Promise<{
  text: string;
  language: string;
  duration: number;
  segments: Array<{ text: string; start: number; end: number; confidence: number }>;
  provider: string;
}> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });

  const audioFile = new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' });

  const transcription = await client.audio.transcriptions.create({
    file: audioFile,
    model,
    language: language || 'en',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  const segments = (transcription as any).segments || [];

  return {
    text: (transcription as any).text || '',
    language: (transcription as any).language || language || 'en',
    duration: (transcription as any).duration || audioBuffer.length / 32000,
    segments: segments
      .filter((seg: any) => {
        const noSpeechProbability = Number(seg.no_speech_prob ?? 0);
        const confidence = typeof seg.avg_logprob === 'number'
          ? Math.max(0, Math.min(1, seg.avg_logprob + 1))
          : 0;
        return noSpeechProbability < 0.6 && confidence >= 0.35 && String(seg.text || '').trim().length > 0;
      })
      .map((seg: any) => ({
        text: String(seg.text || '').trim(),
        start: Number(seg.start || 0),
        end: Number(seg.end || seg.start || 0),
        confidence: typeof seg.avg_logprob === 'number' ? Math.max(0, Math.min(1, seg.avg_logprob + 1)) : 0,
      })),
    provider,
  };
}

/** Detect near-silent PCM16 WAV payloads before paying for an STT request. */
function isSilentWav(buffer: Buffer): boolean {
  if (buffer.length <= 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return false;

  let sumSquares = 0;
  let peak = 0;
  let samples = 0;
  for (let offset = 44; offset + 1 < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset) / 32768;
    const absolute = Math.abs(sample);
    sumSquares += sample * sample;
    peak = Math.max(peak, absolute);
    samples++;
  }

  if (samples === 0) return true;
  const rms = Math.sqrt(sumSquares / samples);
  return rms < 0.008 && peak < 0.03;
}
