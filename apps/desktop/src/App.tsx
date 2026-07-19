import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth';
import { useWebSocket } from './hooks/useWebSocket';
import {
  getAccessToken,
  getRefreshToken,
  getExpiresAt,
  isTokenExpired,
  storeTokens,
} from './lib/auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NewSession from './pages/NewSession';
import SessionDetail from './pages/SessionDetail';
import History from './pages/History';
import Settings from './pages/Settings';
import CvLibrary from './pages/CvLibrary';
import Layout from './components/Layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const bootstrap = async () => {
      const tokenPresent = !!getAccessToken() || !!getRefreshToken();
      if (tokenPresent) {
        try {
          await useAuthStore.getState().fetchMe();
        } finally {
          setAuthBootstrapped(true);
        }
        return;
      }

      setAuthBootstrapped(true);
    };

    void bootstrap();
  }, []);

  // Background token refresh: refresh the access token ~60s before it expires
  // so the user is never kicked out while actively using the app. We use a
  // polling interval rather than a single setTimeout so the timer survives
  // system sleep/idle and always recalculates the remaining time.
  useEffect(() => {
    let interval: number | null = null;

    const tryRefresh = async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return;

      const expiresAt = getExpiresAt();
      const now = Date.now();
      const refreshThreshold = 60_000; // refresh 60s before expiry

      // Only refresh if the token is close to expiring or already expired
      if (expiresAt - now > refreshThreshold) return;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

      try {
        const cloudBase = (import.meta.env.VITE_CLOUD_API_URL as string | undefined) || '';
        const url = `${cloudBase.replace(/\/+$/, '')}/auth/refresh`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          storeTokens(data.tokens);
          try {
            await useAuthStore.getState().fetchMe();
          } catch {
            /* tolerate transient errors */
          }
        } else if (res.status === 401) {
          // Refresh token itself is dead — sign the user out. The interval
          // will be torn down automatically by the effect cleanup.
          useAuthStore.getState().logout();
        }
      } catch {
        /* network blip, retry on next interval */
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    if (getRefreshToken()) {
      // Refresh immediately if already expired at app start
      if (isTokenExpired()) {
        void tryRefresh();
      }
      // Poll every 30s so the refresh decision is always based on the
      // current token lifetime (survives sleep/idle).
      interval = window.setInterval(() => {
        void tryRefresh();
      }, 30_000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [authBootstrapped, isAuthenticated]);

  if (!authBootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Restoring session...
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedLayout>
                    <Dashboard />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/new-session"
                element={
                  <ProtectedLayout>
                    <NewSession />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/sessions/:id"
                element={
                  <ProtectedLayout>
                    <SessionDetail />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/history"
                element={
                  <ProtectedLayout>
                    <History />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedLayout>
                    <Settings />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/cv-library"
                element={
                  <ProtectedLayout>
                    <CvLibrary />
                  </ProtectedLayout>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </WebSocketProvider>
    </QueryClientProvider>
  );
}
