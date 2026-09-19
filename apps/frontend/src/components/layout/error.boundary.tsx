'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

/**
 * Contains a render crash to the subtree that caused it.
 *
 * Next's `error.tsx` files only catch errors thrown by PAGE content. Anything
 * rendered by the layout itself — modals included, and the post composer is a
 * modal — had no boundary between it and `global-error.tsx`, so one bad render
 * replaced the entire app with an error screen (P0, 2026-09-19).
 *
 * `onError` runs once per crash, after React has caught it; use it to report and
 * to clean up (e.g. close the modal). Renders `fallback` (default: nothing) until
 * the boundary is remounted.
 */
export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, info: ErrorInfo) => void;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}
