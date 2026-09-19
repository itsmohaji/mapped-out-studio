'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { resetUiLock } from '@gitroom/frontend/components/layout/ui.lock';

/**
 * Replaces the ROOT layout when something outside every other boundary throws,
 * so none of the app's providers exist here — this page must not depend on them.
 *
 * It used to read the Sentry DSN from a provider that is not mounted here (so
 * the report depended on luck) and then opened Sentry's "Something broke!"
 * dialog in front of the user. Now it reports silently — `captureException` is a
 * no-op when Sentry was never initialised — releases any page lock the crashed
 * tree was holding, and gives the user a way back.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    resetUiLock();
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#0a0c11',
          color: '#f2f2f4',
        }}
      >
        <div style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 20px' }}>
            The problem has been reported automatically. Reloading the page
            usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: 12,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: '#3f86bd',
              color: '#fff',
            }}
          >
            Reload the page
          </button>
        </div>
      </body>
    </html>
  );
}
