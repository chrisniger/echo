import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN || '';
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.VITE_APP_ENV || 'development',
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
          Something went wrong. Please refresh the page.
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
