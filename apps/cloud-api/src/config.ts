import dotenv from 'dotenv';
import { JWT, CLOUD_API, DESKTOP } from '@echo-gpt/shared-config';

dotenv.config();

const TAURI_ORIGINS = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:1420',
];

// Native mobile apps don't enforce CORS, but include common Flutter dev
// ports and the wildcard app:// origin for completeness / web builds.
const MOBILE_ORIGINS = [
  'app://localhost',
  'http://localhost:8081',
  'http://localhost:3000',
  'capacitor://localhost',
];

function parseCorsOrigins(raw: string): string[] {
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of [...TAURI_ORIGINS, ...MOBILE_ORIGINS]) {
    if (!list.includes(origin)) list.push(origin);
  }
  return list;
}

const rawCorsOrigin = process.env.CORS_ORIGIN || DESKTOP.DEV_URL;
const CORS_ORIGIN: string[] = parseCorsOrigins(rawCorsOrigin);

export const config = {
  PORT: parseInt(process.env.PORT || String(CLOUD_API.DEFAULT_PORT), 10),
  JWT_SECRET: process.env.JWT_SECRET || JWT.DEFAULT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || JWT.DEFAULT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || JWT.DEFAULT_REFRESH_EXPIRES_IN,
  DB_PATH: process.env.DB_PATH || './data/echo-gpt.db',
  // API key used for server-to-server calls to the AI Gateway.
  aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY || '',
  CORS_ORIGIN,
};
