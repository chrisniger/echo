import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

declare module 'express' {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: string;
    };
  }
}

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

function extractApiKey(req: Request): string | null {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.length > 0) return header;
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Allow trusted server-to-server calls using a shared API key. This lets the
  // Cloud API call the AI Gateway on behalf of users without forwarding their JWT.
  const apiKey = extractApiKey(req);
  if (apiKey && config.apiKey && apiKey === config.apiKey) {
    // Tag the request with a service identity so downstream routes can still
    // access req.user if they need to distinguish callers.
    req.user = { id: 'service', email: 'service@echo-gpt.local', role: 'service' };
    return next();
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = { id: payload.userId, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
