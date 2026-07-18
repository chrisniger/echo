import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { gatewayApi } from './gateway-client.js';
import type { CvDocument } from '@echo-gpt/shared-types';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

export interface ParsedCV {
  name?: string;
  email?: string;
  phone?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
  languages: string[];
  certifications: string[];
}

export interface Experience {
  title: string;
  company: string;
  startDate: string;
  endDate?: string;
  description: string;
}

export interface Education {
  degree: string;
  institution: string;
  startDate: string;
  endDate?: string;
  field?: string;
}

export class CvParserService {
  /**
   * Parse a CV/resume file and extract structured information
   */
  async parseCv(fileBuffer: Buffer, mimeType: string): Promise<ParsedCV> {
    // Convert file to text based on mime type
    const text = await this.extractText(fileBuffer, mimeType);
    
    // Use AI Gateway to parse the text
    const parsed = await this.parseWithAI(text);
    
    return parsed;
  }

  /** Extract the usable text once so callers can persist the same text sent to the AI parser. */
  async extractTextForStorage(fileBuffer: Buffer, mimeType: string): Promise<string> {
    return this.extractText(fileBuffer, mimeType);
  }

  /**
   * Extract text from file buffer based on mime type
   */
  private async extractText(fileBuffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      return this.extractTextFromPdf(fileBuffer);
    } else if (mimeType.includes('word') || mimeType.includes('docx')) {
      return this.extractTextFromDocx(fileBuffer);
    } else if (mimeType === 'text/plain') {
      return fileBuffer.toString('utf-8');
    }
    
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  private async extractTextFromPdf(fileBuffer: Buffer): Promise<string> {
    const result = await pdfParse(fileBuffer);
    const text = result.text.replace(/\u0000/g, '').trim();
    if (!text) throw new Error('PDF contains no extractable text');
    return text;
  }

  private async extractTextFromDocx(fileBuffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    const text = result.value.replace(/\u0000/g, '').trim();
    if (!text) throw new Error('DOCX contains no extractable text');
    return text;
  }

  /**
   * Use AI Gateway to parse CV text into structured format
   */
  private async parseWithAI(text: string): Promise<ParsedCV> {
    try {
      const response = await gatewayApi.post<{ parsed: ParsedCV }>('/parse-cv', {
        text,
      });
      
      return response.parsed;
    } catch (error) {
      console.error('[CvParser] AI parsing failed, using fallback:', error);
      return this.parseWithFallback(text);
    }
  }

  /**
   * Fallback parser using regex patterns
   */
  private parseWithFallback(text: string): ParsedCV {
    const parsed: ParsedCV = {
      experience: [],
      education: [],
      skills: [],
      languages: [],
      certifications: [],
    };

    // Extract email
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (emailMatch) parsed.email = emailMatch[0];

    // Extract phone
    const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) parsed.phone = phoneMatch[0];

    // Extract skills (simple heuristic)
    const skillsSection = text.match(/skills[:\s]*([\s\S]*?)(?=\n\n|\n[A-Z])/i);
    if (skillsSection) {
      parsed.skills = skillsSection[1]
        .split(/[,•\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 50);
    }

    return parsed;
  }

  /**
   * Store parsed CV in database
   */
  storeCv(
    userId: string,
    fileName: string,
    parsed: ParsedCV,
    rawText: string,
    fileMeta: { fileSize: number; mimeType: string },
  ): string {
    const db = getDb();
    const id = uuid();
    const now = new Date().toISOString();
    const tags = parsed.skills?.length ? parsed.skills.slice(0, 12) : [];

    db.prepare(`
      INSERT INTO cv_library (id, user_id, name, file_name, parsed_data, raw_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      parsed.name || fileName,
      fileName,
      JSON.stringify(parsed),
      rawText,
      now,
      now
    );

    db.prepare(`
      UPDATE cv_library
      SET file_path = ?, file_size = ?, mime_type = ?, version = ?, tags = ?, is_default = ?, parsed_data = ?, raw_text = ?, updated_at = ?
      WHERE id = ?
    `).run(
      fileName,
      fileMeta.fileSize,
      fileMeta.mimeType,
      1,
      JSON.stringify(tags),
      0,
      JSON.stringify(parsed),
      rawText,
      now,
      id,
    );

    return id;
  }

  /**
   * Get CV by ID
   */
  getCv(cvId: string, userId: string): CvDocument | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM cv_library WHERE id = ? AND user_id = ?').get(cvId, userId) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * List all CVs for a user
   */
  listCvs(userId: string): CvDocument[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM cv_library WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Delete a CV
   */
  deleteCv(cvId: string, userId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM cv_library WHERE id = ? AND user_id = ?').run(cvId, userId);
  }

  setDefaultCv(cvId: string, userId: string): CvDocument | null {
    const db = getDb();
    const now = new Date().toISOString();

    const target = db.prepare('SELECT * FROM cv_library WHERE id = ? AND user_id = ?').get(cvId, userId) as any;
    if (!target) return null;

    db.prepare('UPDATE cv_library SET is_default = 0, updated_at = ? WHERE user_id = ?').run(now, userId);
    db.prepare('UPDATE cv_library SET is_default = 1, updated_at = ? WHERE id = ? AND user_id = ?').run(now, cvId, userId);

    return this.mapRow({ ...target, is_default: 1, updated_at: now });
  }

  updateCv(
    cvId: string,
    userId: string,
    updates: { name?: string; tags?: string[]; isDefault?: boolean },
  ): CvDocument | null {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM cv_library WHERE id = ? AND user_id = ?').get(cvId, userId) as any;
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextName = updates.name ?? existing.name;
    const nextTags = updates.tags ?? this.parseTags(existing.tags);
    const nextIsDefault = updates.isDefault ?? !!existing.is_default;

    if (nextIsDefault) {
      db.prepare('UPDATE cv_library SET is_default = 0, updated_at = ? WHERE user_id = ?').run(now, userId);
    }

    db.prepare(`
      UPDATE cv_library
      SET name = ?, tags = ?, is_default = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      nextName,
      JSON.stringify(nextTags),
      nextIsDefault ? 1 : 0,
      now,
      cvId,
      userId,
    );

    const updated = db.prepare('SELECT * FROM cv_library WHERE id = ? AND user_id = ?').get(cvId, userId) as any;
    return this.mapRow(updated);
  }

  private parseTags(rawTags: unknown): string[] {
    if (Array.isArray(rawTags)) return rawTags.filter((tag) => typeof tag === 'string');
    if (typeof rawTags === 'string') {
      try {
        const parsed = JSON.parse(rawTags);
        return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === 'string') : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private mapRow(row: any): CvDocument {
    const parsedData = row.parsed_data ? safeJsonParse(row.parsed_data) : {};
    const tags = this.parseTags(row.tags);
    return {
      id: row.id,
      name: row.name,
      filePath: row.file_path || row.file_name,
      fileSize: row.file_size ?? 0,
      mimeType: row.mime_type || inferMimeType(row.file_name),
      parsedText: row.raw_text || JSON.stringify(parsedData, null, 2),
      isDefault: !!row.is_default,
      tags: tags.length > 0 ? tags : Array.isArray(parsedData?.skills) ? parsedData.skills : [],
      version: row.version ?? 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  }
}

export const cvParserService = new CvParserService();

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  return 'text/plain';
}
