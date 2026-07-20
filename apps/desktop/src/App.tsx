import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth';
import { useWebSocket } from './hooks/useWebSocket';
import { getAccessToken, getRefreshToken, getExpiresAt, isTokenExpired } from './lib/auth';
import { refreshAuthToken } from './lib/api';
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
  // recursive setTimeout so the timer survives system sleep/idle and the poll
  // interval can speed up when the token is near expiry or already expired.
  useEffect(() => {
    let timeout: number | null = null;
    let stopped = false;

    const tryRefresh = async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return;

      const expiresAt = getExpiresAt();
      const now = Date.now();
      const refreshThreshold = 60_000; // refresh 60s before expiry

      // Only refresh if the token is close to expiring or already expired
      if (expiresAt - now > refreshThreshold) return;

      const result = await refreshAuthToken();
      if (result.success) {
        try {
          await useAuthStore.getState().fetchMe();
        } catch {
          /* tolerate transient errors */
        }
      } else if (result.isDead) {
        // Refresh token itself is dead — sign the user out. The timeout
        // will be torn down automatically by the effect cleanup.
        useAuthStore.getState().logout();
      }
    };

    const scheduleNext = () => {
      if (stopped) return;

      const refreshToken = getRefreshToken();
      if (!refreshToken) return;

      const expiresAt = getExpiresAt();
      const now = Date.now();
      const refreshThreshold = 60_000;
      const needsRefresh = expiresAt - now <= refreshThreshold;

      // Poll more frequently when the token is expired or close to expiry so
      // a transient network failure doesn't leave the user stale for long.
      const delay = needsRefresh ? 5_000 : 30_000;

      timeout = window.setTimeout(() => {
        void tryRefresh().then(scheduleNext);
      }, delay);
    };

    if (getRefreshToken()) {
      // Refresh immediately if already expired at app start, then schedule
      // the next check based on the updated token lifetime.
      if (isTokenExpired()) {
        void tryRefresh().then(scheduleNext);
      } else {
        scheduleNext();
      }
    }

    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
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
