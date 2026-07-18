'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storeTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ user: any; tokens: any }>('/auth/login', { email, password });
      storeTokens(res.tokens);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Echo GPT</h1>
          <p className="text-sm text-zinc-400 mt-1">Sign in to your account</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-echo-600 hover:bg-echo-700 rounded-lg font-medium transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          </form>
          <p className="text-center text-sm text-zinc-500">Don't have an account? <a href="/register" className="text-echo-400 hover:underline">Register</a></p>
        </div>
    </div>
  );
}
