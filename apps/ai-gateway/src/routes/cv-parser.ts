import { Router } from 'express';
import { z } from 'zod';
import type { ChatRequest } from '@echo-gpt/shared-types';
import type { AiRouter } from '../services/router.js';

const cvParseRequestSchema = z.object({
  text: z.string(),
});

export function createCvParserRouter(routerInstance: AiRouter): Router {
  const router = Router();

  router.post('/parse-cv', async (req, res) => {
    try {
      const parsed = cvParseRequestSchema.parse(req.body);

      const result = await parseCv(parsed.text, routerInstance);

      res.json({ parsed: result });
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

interface ParsedCV {
  name?: string;
  email?: string;
  phone?: string;
  summary?: string;
  experience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate?: string;
    description: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    startDate: string;
    endDate?: string;
    field?: string;
  }>;
  skills: string[];
  languages: string[];
  certifications: string[];
}

async function parseCv(text: string, routerInstance: AiRouter): Promise<ParsedCV> {
  // Use AI to parse the CV
  const prompt = `Parse the following CV/resume text and extract structured information. Return a JSON object with the following structure:
{
  "name": "Full name",
  "email": "email@example.com",
  "phone": "phone number",
  "summary": "Professional summary",
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "startDate": "YYYY-MM or YYYY",
      "endDate": "YYYY-MM or YYYY or Present",
      "description": "Job description"
    }
  ],
  "education": [
    {
      "degree": "Degree name",
      "institution": "Institution name",
      "startDate": "YYYY",
      "endDate": "YYYY",
      "field": "Field of study"
    }
  ],
  "skills": ["skill1", "skill2"],
  "languages": ["language1", "language2"],
  "certifications": ["cert1", "cert2"]
}

CV Text:
${text}

Return ONLY the JSON object, no additional text.`;

  try {
    // Call the chat router directly to avoid an internal HTTP round-trip.
    const request: ChatRequest = {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            'You are a CV/resume parser. Extract structured information from the provided text and return it as a JSON object.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: false,
      temperature: 0.1,
      maxTokens: 4000,
    };

    const response = await routerInstance.chat(request);
    const content = response.content;

    // Extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        summary: parsed.summary,
        experience: parsed.experience || [],
        education: parsed.education || [],
        skills: parsed.skills || [],
        languages: parsed.languages || [],
        certifications: parsed.certifications || [],
      };
    }

    throw new Error('Failed to parse JSON from AI response');
  } catch (error) {
    console.error('[CV Parser] AI parsing failed:', error);

    // Fallback to regex-based parsing
    return parseCvFallback(text);
  }
}

function parseCvFallback(text: string): ParsedCV {
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

  // Extract skills
  const skillsSection = text.match(/skills[:\s]*([\s\S]*?)(?=\n\n|\n[A-Z])/i);
  if (skillsSection) {
    parsed.skills = skillsSection[1]
      .split(/[,•\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 50);
  }

  return parsed;
}
