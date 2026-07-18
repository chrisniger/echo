import { gatewayApi } from '../lib/api';

export interface DocumentAnalysis {
  keyPoints: string[];
  summary: string;
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
}

export async function analyzeDocument(
  text: string,
  options: {
    extractKeyPoints?: boolean;
    summarize?: boolean;
    extractEntities?: boolean;
  } = {}
): Promise<DocumentAnalysis> {
  const { extractKeyPoints = true, summarize = true, extractEntities = false } = options;

  const messages = [];
  
  let prompt = 'Analyze the following document text:\n\n';
  prompt += text;
  prompt += '\n\nPlease provide:';
  
  if (extractKeyPoints) {
    prompt += '\n1. Key points (as a list)';
  }
  if (summarize) {
    prompt += '\n2. A concise summary';
  }
  if (extractEntities) {
    prompt += '\n3. Named entities (people, organizations, dates, etc.)';
  }

  messages.push({
    role: 'system',
    content: 'You are a document analysis assistant. Analyze the provided text and extract key information in a structured format. Return your analysis as JSON with the following structure: { "keyPoints": string[], "summary": string, "entities": Array<{type: string, value: string, confidence: number}> }'
  });
  
  messages.push({
    role: 'user',
    content: prompt
  });

  try {
    const response = await gatewayApi.post<{
      content: string;
      model: string;
      provider: string;
      tokensUsed: { prompt: number; completion: number; total: number };
    }>('/chat', {
      model: 'deepseek-chat',
      messages,
      stream: false,
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Parse the response content as JSON
    const content = response.content;
    
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        keyPoints: parsed.keyPoints || [],
        summary: parsed.summary || '',
        entities: parsed.entities || [],
      };
    }

    // Fallback: create a basic analysis from the text
    return {
      keyPoints: extractKeyPointsFallback(text),
      summary: summarizeFallback(text),
      entities: [],
    };
  } catch (error) {
    console.error('Document analysis failed:', error);
    // Return basic analysis on error
    return {
      keyPoints: extractKeyPointsFallback(text),
      summary: summarizeFallback(text),
      entities: [],
    };
  }
}

function extractKeyPointsFallback(text: string): string[] {
  // Simple fallback: extract sentences that look important
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  return sentences.slice(0, 5).map(s => s.trim());
}

function summarizeFallback(text: string): string {
  // Simple fallback: first 200 characters
  return text.substring(0, 200).trim() + (text.length > 200 ? '...' : '');
}
