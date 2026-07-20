import { config } from '../config.js';

const GATEWAY_BASE_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4001';

class GatewayClient {
  private baseUrl: string;

  constructor(baseUrl: string = GATEWAY_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.aiGatewayApiKey) {
      headers['X-API-Key'] = config.aiGatewayApiKey;
    }
    return headers;
  }

  async post<T>(path: string, body: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Gateway request failed: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new Error(`Gateway request failed: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}

export const gatewayApi = new GatewayClient();
