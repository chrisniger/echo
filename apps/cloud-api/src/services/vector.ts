import { getDb } from '../db/index.js';
import { gatewayApi } from './gateway-client.js';

export interface EmbeddingResult {
  id: string;
  sessionId: string;
  text: string;
  score: number;
}

interface Embedding {
  id: string;
  sessionId: string;
  text: string;
  embedding: number[];
  createdAt: string;
}

// In-memory vector store (replace with proper vector DB in production)
const vectorStore = new Map<string, Embedding>();

export class VectorSearch {
  private readonly GATEWAY_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4001';

  /**
   * Generate embeddings for text using the AI Gateway
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await gatewayApi.post<{ embedding: number[] }>('/embeddings', {
        text,
        model: 'text-embedding-3-small',
      });
      return response.embedding;
    } catch (error) {
      console.error('[VectorSearch] Failed to generate embedding:', error);
      // Return a simple hash-based embedding as fallback
      return this.generateFallbackEmbedding(text);
    }
  }

  /**
   * Generate a simple hash-based embedding as fallback
   */
  private generateFallbackEmbedding(text: string): number[] {
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

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Index a session's transcript for semantic search
   */
  async indexSession(sessionId: string, transcriptText: string): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(transcriptText);
      
      const vector: Embedding = {
        id: sessionId,
        sessionId,
        text: transcriptText,
        embedding,
        createdAt: new Date().toISOString(),
      };
      
      vectorStore.set(sessionId, vector);
      
      // Also store in database for persistence
      const db = getDb();
      db.prepare(`
        INSERT OR REPLACE INTO session_embeddings (session_id, embedding, created_at)
        VALUES (?, ?, ?)
      `).run(sessionId, JSON.stringify(embedding), vector.createdAt);
      
      console.log(`[VectorSearch] Indexed session ${sessionId}`);
    } catch (error) {
      console.error(`[VectorSearch] Failed to index session ${sessionId}:`, error);
    }
  }

  /**
   * Search for similar sessions using semantic similarity
   */
  async search(query: string, userId: string, limit = 20): Promise<EmbeddingResult[]> {
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Get all sessions for the user
      const db = getDb();
      const sessions = db.prepare(`
        SELECT id, name, model, created_at 
        FROM session_metadata 
        WHERE user_id = ? AND status = 'completed'
        ORDER BY created_at DESC
      `).all(userId) as any[];
      
      // Calculate similarity scores
      const results: EmbeddingResult[] = [];
      
      for (const session of sessions) {
        const vector = vectorStore.get(session.id);
        
        if (vector) {
          const score = this.cosineSimilarity(queryEmbedding, vector.embedding);
          results.push({
            id: session.id,
            sessionId: session.id,
            text: `${session.name} — ${session.model || 'unknown model'}`,
            score,
          });
        } else {
          // Fallback to keyword search for unindexed sessions
          const keywords = query.toLowerCase().split(/\s+/);
          const sessionText = `${session.name} ${session.model || ''}`.toLowerCase();
          const matchCount = keywords.filter(kw => sessionText.includes(kw)).length;
          
          if (matchCount > 0) {
            results.push({
              id: session.id,
              sessionId: session.id,
              text: `${session.name} — ${session.model || 'unknown model'}`,
              score: matchCount / keywords.length * 0.5, // Lower score for keyword matches
            });
          }
        }
      }
      
      // Sort by score and return top results
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error('[VectorSearch] Search failed:', error);
      return [];
    }
  }

  /**
   * Get statistics about indexed sessions
   */
  getStats(): { indexedSessions: number; totalSessions: number } {
    const db = getDb();
    const totalSessions = (
      db.prepare("SELECT COUNT(*) as count FROM session_metadata WHERE status = 'completed'").get() as any
    ).count;
    
    return {
      indexedSessions: vectorStore.size,
      totalSessions,
    };
  }

  /**
   * Remove a session from the index
   */
  removeSession(sessionId: string): void {
    vectorStore.delete(sessionId);
    
    const db = getDb();
    db.prepare('DELETE FROM session_embeddings WHERE session_id = ?').run(sessionId);
  }

  /**
   * Clear all indexed sessions
   */
  clearIndex(): void {
    vectorStore.clear();
    
    const db = getDb();
    db.prepare('DELETE FROM session_embeddings').run();
  }
}

export const vectorSearch = new VectorSearch();
